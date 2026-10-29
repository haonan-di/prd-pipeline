/**
 * publish 工具（契约 §4 G）—— 本地交付 + 在线协同交接。
 * 不内置任何平台连接器、不存凭证；在线发布由 agent 用用户声明的文档 MCP 执行。
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config.js";
import { uniqueFilePath } from "../task.js";
import { assertHostPath, HostPathError } from "../paths.js";
import { okResult, failResult } from "../envelope.js";

export const PUBLISH_TOOL = {
  name: "prd/publish",
  description:
    "交付 PRD：local=写本地文件；在线系统=产出交接指引（由 agent 用用户文档 MCP 执行）。默认 local_first。",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      content: { type: "string", description: "PRD 正文（markdown）" },
      version: { type: "string", default: "1.0" },
      system: { type: "string", enum: ["local", "confluence", "feishu", "notion", "other"] },
    },
    required: ["title", "content"],
  },
} as const;

function prdFilename(title: string, version: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safe = title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);
  return `${date}-${safe}-v${version}.md`;
}

/** 数一数正文里有多少个 mermaid 代码块——目标平台不原生渲染时需要先出图 */
function countMermaidBlocks(content: string): number {
  return (content.match(/```mermaid/g) ?? []).length;
}

/**
 * 远程交接单：把「发一个页面」拆成 agent 可执行的步骤。
 * 关键约定是 upsert——先按标题在空间内检索，命中则更新、未命中才新建，
 * 避免同一份 PRD 反复发布把空间刷成副本。
 */
function buildHandoff(
  title: string,
  version: string,
  content: string,
  ds: { type: string; remote: { platform: string; mcp_server: string; space: string; parent_page_id: string } } | undefined,
  system: string
) {
  const platform = ds?.remote.platform ?? system;
  const mcp = ds?.remote.mcp_server ?? "";
  const space = ds?.remote.space ?? "";
  const parent = ds?.remote.parent_page_id ?? "";
  const mermaidBlocks = countMermaidBlocks(content);

  const instructions = [
    `调用用户声明的文档 MCP「${mcp || "(未声明)"}」执行 upsert（先查后建）：`,
    `- 步骤 1：在 space=${space || "(未配置)"} 中按标题精确检索「${title}」`,
    "- 步骤 2：命中同名页面 → 更新该页面正文，保留页面 ID 与评论；未命中 → 新建页面",
    parent ? `- 步骤 3：新建时作为子页面挂到 parent_page_id=${parent}` : "- 步骤 3：新建时放在 space 根下（未配置父页面）",
    `- 步骤 4：正文使用下方 content；标题=${title}，版本=v${version}`,
    mermaidBlocks > 0
      ? `- 步骤 5：正文含 ${mermaidBlocks} 个 mermaid 代码块，若目标平台不原生渲染，先逐个调 prd/diagram.build 出图再替换（涉密内容保持 strategy=source，不要外发）`
      : "- 步骤 5：正文无 mermaid 代码块，直接写入",
    "- 步骤 6：写入后回读页面，核对标题、版本号与章节数，确认没有截断",
  ];

  return {
    platform,
    mcp_server: mcp || null,
    space: space || null,
    parent_page_id: parent || null,
    doc_key: `${platform}/${space || "-"}/${title}`,
    operation: "upsert" as const,
    title,
    version,
    content,
    assets: {
      mermaid_blocks: mermaidBlocks,
      needs_rendering: mermaidBlocks > 0,
      note:
        mermaidBlocks > 0
          ? "目标平台若不渲染 mermaid，需先出图；remote 策略会把内容发给第三方"
          : "无需处理图表",
    },
    checklist: instructions.slice(1).map((line) => line.replace(/^-\s*/, "")),
    instructions,
    verify: { re_read: true, compare: ["标题", "版本号", "章节数"] },
    ...(mcp === "" ? { warning: "未声明 remote_mcp_server：交接单可读，但无法执行" } : {}),
  };
}

export function handlePublish(args: Record<string, unknown>) {
  try {
    const title = (args.title as string) ?? "";
    const content = (args.content as string) ?? "";
    if (title.trim() === "" || content.trim() === "") {
      return failResult("INVALID_INPUT", "缺少 title 或 content");
    }

    const config = readConfig()?.config;
    const ds = config?.document_system;
    const version = (args.version as string) || "1.0";
    const system = (args.system as string) || ds?.type || "local";
    const mode = ds?.mode ?? "local_first";

    const out: Record<string, unknown> = { title, version, system, mode };

    // 本地交付（local，或 local_first 的第一段）
    if (system === "local" || mode === "local_first") {
      const vault = ds?.local.vault_path ?? "";
      if (vault === "") {
        return failResult(
          "INVALID_INPUT",
          "未配置本地交付目录（document_system.local.vault_path）",
          "运行 prd/workspace.init 指定 local_path"
        );
      }
      try {
        assertHostPath(vault, "document_system.local.vault_path");
      } catch (error) {
        if (error instanceof HostPathError) {
          return failResult(
            "INVALID_INPUT",
            error.message,
            "local_path 必须是运行 server 的机器上的有效路径"
          );
        }
        throw error;
      }
      const dir = join(vault, ds?.local.subdir ?? "PRD");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const file = uniqueFilePath(dir, prdFilename(title, version));
      writeFileSync(file, content, "utf-8");
      out.local = { path: file };
    }

    // 在线协同交接（不真正发文档，交给 agent 用声明的 MCP 执行）
    if (system !== "local") {
      out.remote_handoff = buildHandoff(title, version, content, ds, system);
    }

    out.message =
      mode === "local_first"
        ? "已落本地；用户确认后可同步至声明系统。"
        : "已按 remote_first 生成交接指引。";
    return okResult(out);
  } catch (error) {
    return failResult("IO_ERROR", `交付失败：${String(error)}`);
  }
}
