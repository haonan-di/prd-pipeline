/**
 * context 工具（契约 §4 C）—— 本地文档搜索
 * 在线历史文档调研由 agent 借助用户声明的文档 MCP 完成（编排层）。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config.js";
import { resolveWorkspaceRoot } from "../task.js";
import { okResult, failResult } from "../envelope.js";

export const CONTEXT_SEARCH_TOOL = {
  name: "prd/context.search",
  description:
    "在本地目录检索历史文档（md）。在线历史文档调研请由 agent 调用用户声明的文档 MCP。",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      scope: { type: "string", enum: ["local", "auto"], default: "auto" },
      dir: { type: "string", description: "覆盖搜索目录（默认取 document_system.local.vault_path）" },
      limit: { type: "number", default: 10 },
    },
    required: ["query"],
  },
} as const;

interface SearchHit {
  title: string;
  path: string;
  snippet: string;
  source: "local";
}

function collectMdFiles(dir: string, acc: string[] = []): string[] {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          collectMdFiles(full, acc);
        }
      } else if (entry.name.endsWith(".md")) {
        acc.push(full);
      }
    }
  } catch {
    /* 跳过无权限目录 */
  }
  return acc;
}

function searchLocal(query: string, limit: number, dir: string): SearchHit[] {
  const hits: SearchHit[] = [];
  if (!existsSync(dir)) return hits;
  const needle = query.toLowerCase();

  for (const file of collectMdFiles(dir)) {
    if (hits.length >= limit) break;
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    const idx = lines.findIndex((l) => l.toLowerCase().includes(needle));
    if (idx === -1) continue;
    const titleLine = lines.find((l) => l.startsWith("# "));
    hits.push({
      title: titleLine ? titleLine.replace(/^#\s+/, "").trim() : file,
      path: file,
      snippet: lines.slice(Math.max(0, idx - 1), idx + 3).join("\n").slice(0, 240),
      source: "local",
    });
  }
  return hits;
}

export function handleContextSearch(args: Record<string, unknown>) {
  const query = (args.query as string) ?? "";
  if (query.trim() === "") return failResult("INVALID_INPUT", "缺少查询关键词 query");

  const config = readConfig()?.config;
  const limit = (args.limit as number) ?? 10;
  const dir =
    (args.dir as string) ||
    config?.document_system.local.vault_path ||
    resolveWorkspaceRoot(config?.workspace_root);

  const results = searchLocal(query, limit, dir);
  return okResult({ query, search_path: dir, total: results.length, results });
}
