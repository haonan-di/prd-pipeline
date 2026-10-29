/**
 * workspace 工具（契约 §4 A）—— init / status / config
 * 关键修正：可用预设列表由扫描得出，取代硬编码。
 */

import { join } from "node:path";
import { readConfig, writeConfig, getWorkspaceStatus, resolveConfigPath } from "../config.js";
import { WorkspaceConfigV3, type WorkspaceConfigV3T } from "../contracts/index.js";
import { discoverPresets, presetDirWarnings } from "../presets/loader.js";
import { findBrowser, mermaidBundleStatus } from "../diagram/browser.js";
import { resolveWorkspaceRoot } from "../task.js";
import { assertHostPath, HostPathError } from "../paths.js";
import { okResult, failResult } from "../envelope.js";

export const WORKSPACE_INIT_TOOL = {
  name: "prd/workspace.init",
  description:
    "初始化或更新 PRD 工作区配置（config v3）。合并式：只覆盖传入字段。领域/人设等预设均可选，不选不影响就绪。返回可用预设（扫描得出）。",
  inputSchema: {
    type: "object",
    properties: {
      domain: { type: "string", description: "领域预设名，如 fintech" },
      soul: { type: "string", description: "人设预设名，如 c-end-pm / general-pm" },
      template: { type: "string", description: "模板预设名，默认 standard" },
      stages: { type: "string", description: "阶段集预设名，默认 standard" },
      product_form: { type: "string", enum: ["c-end", "b-end"] },
      doc_system: {
        type: "string",
        enum: ["local", "confluence", "feishu", "notion", "other"],
        description: "文档系统；local=仅本地交付；其余=协同用户文档 MCP",
      },
      doc_mode: { type: "string", enum: ["local_first", "remote_first"] },
      local_path: { type: "string", description: "本地交付目录（如 Obsidian vault）" },
      local_subdir: { type: "string", description: "本地交付子目录，默认 PRD" },
      remote_platform: { type: "string", description: "在线平台名（仅提示用）" },
      remote_mcp_server: { type: "string", description: "用户声明的文档 MCP 名" },
      remote_space: { type: "string", description: "在线空间/文件夹" },
      remote_parent_page_id: { type: "string", description: "在线父页面 ID（新建页面时挂载到此）" },
      workspace_root: { type: "string", description: "工作区根；空=由 agent 按会话项目目录派生" },
      preset_dirs: { type: "array", items: { type: "string" }, description: "自定义预设目录" },
      status: { type: "string", enum: ["active", "draft"] },
    },
  },
} as const;

export const WORKSPACE_STATUS_TOOL = {
  name: "prd/workspace.status",
  description: "静默自检：返回 ready / draft / uninitialized 及当前配置。",
  inputSchema: { type: "object", properties: {} },
} as const;

export const WORKSPACE_CONFIG_TOOL = {
  name: "prd/workspace.config",
  description: "查看或更新单项配置（与 init 同参，合并式）。",
  inputSchema: WORKSPACE_INIT_TOOL.inputSchema,
} as const;

function currentOrDefault(): WorkspaceConfigV3T {
  const loaded = readConfig();
  if (loaded) return loaded.config;
  return WorkspaceConfigV3.parse({ version: 3, status: "draft" });
}

export function handleWorkspaceInit(args: Record<string, unknown>) {
  try {
    const base = currentOrDefault();
    // 领域始终有值：未提供 → 沿用；显式空串 → 归一到默认 general
    const domainArg = args.domain as string | undefined;
    const resolvedDomain =
      domainArg === undefined
        ? base.workspace.domain || "general"
        : domainArg.trim() === ""
          ? "general"
          : domainArg;

    // 本地交付目录：未指定时给一个显式默认值（而不是留空导致 publish 报错）
    const localArg = args.local_path as string | undefined;
    const resolvedVault =
      localArg || base.document_system.local.vault_path || join(process.cwd(), "prd-output");
    const defaultsApplied: string[] = [];
    if (!localArg && !base.document_system.local.vault_path) {
      defaultsApplied.push(`本地交付目录未指定，已使用默认：${resolvedVault}`);
    }

    // 切换文档系统时同步平台名，否则 remote.platform 会一直停在默认值 confluence，
    // 导致飞书空间也套用 Confluence 的 CQL、交接单报错平台。
    const docTypeArg = args.doc_system as string | undefined;
    const platformArg = args.remote_platform as string | undefined;
    const resolvedPlatform: string =
      platformArg ??
      (docTypeArg !== undefined && docTypeArg !== "local" && docTypeArg !== "other"
        ? docTypeArg
        : base.document_system.remote.platform);
    const next = WorkspaceConfigV3.parse({
      ...base,
      // 显式调用 init 即视为已初始化。就绪判定不依赖领域（避免"没选领域就永远 draft"）。
      status: (args.status as string) ?? "active",
      workspace: {
        ...base.workspace,
        domain: resolvedDomain,
        soul: (args.soul as string) ?? base.workspace.soul,
        template: (args.template as string) ?? base.workspace.template,
        stages: (args.stages as string) ?? base.workspace.stages,
        product_form: (args.product_form as string) ?? base.workspace.product_form,
      },
      document_system: {
        ...base.document_system,
        type: (args.doc_system as string) ?? base.document_system.type,
        mode: (args.doc_mode as string) ?? base.document_system.mode,
        local: {
          vault_path: resolvedVault,
          subdir: (args.local_subdir as string) ?? base.document_system.local.subdir,
        },
        remote: {
          ...base.document_system.remote,
          platform: resolvedPlatform,
          mcp_server: (args.remote_mcp_server as string) ?? base.document_system.remote.mcp_server,
          space: (args.remote_space as string) ?? base.document_system.remote.space,
          parent_page_id:
            (args.remote_parent_page_id as string) ?? base.document_system.remote.parent_page_id,
        },
      },
      workspace_root:
        (args.workspace_root as string) || base.workspace_root || resolveWorkspaceRoot(""),
      preset_dirs: (args.preset_dirs as string[]) ?? base.preset_dirs,
    });

    // workspace_root 必须是当前机器可用的路径：异构平台路径会被当成文件名创建（无声失败）
    try {
      assertHostPath(next.workspace_root, "workspace_root");
    } catch (error) {
      if (error instanceof HostPathError) {
        return failResult("INVALID_INPUT", error.message, "改为传当前运行平台可用的绝对路径");
      }
      throw error;
    }

    const path = writeConfig(next);
    const presets = discoverPresets({ presetDirs: next.preset_dirs });
    const byType = (t: string) => presets.filter((p) => p.type === t).map((p) => p.name);

    const warnings: string[] = [];
    if (!args.workspace_root) {
      warnings.push(
        `未显式指定 workspace_root，已回退为 ${next.workspace_root}。若不合适，请传 workspace_root 更正（尤其当它落在用户主目录时）。`
      );
    }
    if (
      next.document_system.type !== "local" &&
      next.document_system.remote.mcp_server === ""
    ) {
      warnings.push("未声明文档 MCP（remote_mcp_server）：将只能本地交付，无法协同在线发布/调研。");
    }
    if (next.document_system.type !== "local" && next.document_system.remote.space === "") {
      warnings.push("未声明在线空间（remote_space）：交接单会把 space 标为未配置，agent 无法定位目标空间。");
    }
    if (next.workspace.domain && !byType("domain").includes(next.workspace.domain)) {
      warnings.push(`领域预设「${next.workspace.domain}」不存在，可用：${byType("domain").join(", ") || "（无）"}`);
    }
    for (const w of presetDirWarnings(next.preset_dirs)) {
      warnings.push(`自定义预设目录 ${w.path}：${w.message}`);
    }

    // 图表能力自检：把"能不能本地出图、要不要联网"在初始化时就说清楚
    const browser = findBrowser();
    const mermaid = mermaidBundleStatus();
    if (!browser) {
      warnings.push(
        "未找到可用浏览器（Edge/Chrome）：图表 local 策略会降级为 source。可用 PRD_BROWSER_PATH 指定浏览器路径。"
      );
    } else if (!mermaid.available) {
      warnings.push(
        "未安装 mermaid 包：local 出图会从 CDN 加载渲染脚本（图内容不外发，但需要联网）。离线或涉密环境请先执行 npm i mermaid。"
      );
    }

    return okResult({
      status: getWorkspaceStatus(),
      path,
      workspace_root: next.workspace_root,
      config: next,
      available: {
        domains: byType("domain"),
        souls: byType("soul"),
        templates: byType("template"),
        stages: byType("stages"),
        compliance: byType("compliance"),
        diagrams: byType("diagrams"),
      },
      defaults_applied: defaultsApplied,
      capabilities: {
        diagram: {
          browser: browser ? { found: true, kind: browser.kind, path: browser.path } : { found: false },
          mermaid_bundle: mermaid,
          local_render_ready: Boolean(browser && mermaid.available),
        },
      },
      document_system: {
        type: next.document_system.type,
        mode: next.document_system.mode,
        local_subdir: next.document_system.local.subdir,
        remote_platform: next.document_system.remote.platform,
        remote_space: next.document_system.remote.space,
        remote_mcp_server: next.document_system.remote.mcp_server,
        remote_parent_page_id: next.document_system.remote.parent_page_id,
        ready:
          next.document_system.type === "local" ||
          (next.document_system.remote.mcp_server !== "" &&
            next.document_system.remote.space !== ""),
      },
      warnings,
    });
  } catch (error) {
    return failResult("INVALID_INPUT", `初始化失败：${String(error)}`);
  }
}

export function handleWorkspaceStatus() {
  const loaded = readConfig();
  const status = getWorkspaceStatus();
  if (!loaded) {
    return okResult({
      status,
      initialized: false,
      message: "未初始化。可运行 prd/workspace.init（文档系统可跳过，仅本地交付）。",
    });
  }
  return okResult({
    status,
    initialized: status === "ready",
    migrated_from_older: loaded.migrated,
    path: loaded.path,
    config: loaded.config,
  });
}

export function handleWorkspaceConfig(args: Record<string, unknown>) {
  const loaded = readConfig();
  if (!loaded) {
    return failResult("NOT_INITIALIZED", "工作区未初始化，请先运行 prd/workspace.init。");
  }
  return handleWorkspaceInit(args);
}
