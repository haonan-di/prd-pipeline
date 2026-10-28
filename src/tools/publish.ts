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

    // 在线协同交接（不真正发文档，交给 agent）
    if (system !== "local") {
      const mcp = ds?.remote.mcp_server || "(未声明)";
      const space = ds?.remote.space || "(未配置)";
      out.remote_handoff = {
        platform: ds?.remote.platform ?? system,
        mcp_server: mcp,
        space,
        parent_page_id: ds?.remote.parent_page_id ?? "",
        content,
        instructions: [
          `调用用户声明的文档 MCP「${mcp}」创建/更新页面：`,
          `- space=${space}`,
          ds?.remote.parent_page_id
            ? `- 作为子页面挂到 parent_page_id=${ds.remote.parent_page_id}`
            : "- 新建页面",
          `- 标题=${title}`,
          "- 正文=上述 content；若目标平台不原生渲染 mermaid，先用 prd/diagram.build 出图再嵌入",
        ],
      };
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
