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
    "检索历史文档：本地 md 直接搜；声明了在线文档系统时额外产出检索计划（由 agent 调用用户的文档 MCP 执行）。",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      scope: { type: "string", enum: ["local", "remote", "auto"], default: "auto" },
      dir: { type: "string", description: "覆盖本地搜索目录（默认取 document_system.local.vault_path）" },
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

interface RemoteQuery {
  kind: string;
  text: string;
  purpose: string;
  cql?: string;
}

interface RemotePlanInput {
  type: string;
  remote: { platform: string; mcp_server: string; space: string; parent_page_id: string };
}

/**
 * 在线检索计划：工具不联网、不持有凭证，只把「该查什么、怎么判断」结构化交给 agent。
 * 这样编排与执行分离，用户声明的文档 MCP 由 agent 调用。
 */
function buildRemotePlan(query: string, ds: RemotePlanInput, domain: string) {
  const platform = ds.remote.platform || ds.type;
  const space = ds.remote.space || "";
  const mcp = ds.remote.mcp_server || "";

  const base: RemoteQuery[] = [
    { kind: "requirement", text: query, purpose: "历史需求文档与旧版 PRD，确认是否已有同类需求" },
    { kind: "tech", text: `${query} 技术方案`, purpose: "技术设计与接口约束，确认实现边界" },
    { kind: "decision", text: `${query} 评审`, purpose: "评审记录与决策依据，确认历史取舍" },
  ];

  const queries =
    ds.type === "confluence" && space !== ""
      ? base.map((q) => ({
          ...q,
          cql: `text ~ "${q.text}" AND space = "${space}" ORDER BY lastmodified DESC`,
        }))
      : base;

  const instructions = [
    `调用用户声明的文档 MCP「${mcp || "(未声明)"}」执行以下检索：`,
    ...queries.map((q, i) => `${i + 1}. ${q.text} —— ${q.purpose}`),
    "- 时间范围：近 12 个月优先；更早的只取与本次需求直接相关者",
    "- 每条结果带回：标题、链接、最后修改时间、与本次需求的关系（已有 / 冲突 / 可复用）",
    "- MCP 不可用或空间无权限时，如实告知用户；不要用本地结果冒充在线调研",
  ];

  return {
    platform,
    mcp_server: mcp || null,
    space: space || null,
    parent_page_id: ds.remote.parent_page_id || null,
    domain,
    queries,
    instructions,
    generated_at: new Date().toISOString().slice(0, 10),
    ...(mcp === "" ? { warning: "未声明 remote_mcp_server：计划可读，但无法执行" } : {}),
  };
}

export function handleContextSearch(args: Record<string, unknown>) {
  const query = ((args.query as string) ?? "").trim();
  if (query === "") return failResult("INVALID_INPUT", "缺少查询关键词 query");

  const config = readConfig()?.config;
  const limit = (args.limit as number) ?? 10;
  const scope = ((args.scope as string) || "auto") as "local" | "remote" | "auto";
  const ds = config?.document_system;
  const remoteDeclared = ds !== undefined && ds.type !== "local";

  if (scope === "remote" && !remoteDeclared) {
    return failResult(
      "INVALID_INPUT",
      "未声明在线文档系统，无法生成远程检索计划",
      "运行 prd/workspace.init 指定 doc_system 与 remote_mcp_server，或改用 scope=local"
    );
  }

  const dir =
    (args.dir as string) ||
    ds?.local.vault_path ||
    resolveWorkspaceRoot(config?.workspace_root);

  const results = scope === "remote" ? [] : searchLocal(query, limit, dir);

  const data: Record<string, unknown> = {
    query,
    scope,
    search_path: dir,
    total: results.length,
    results,
  };

  if (scope === "local") {
    data.remote_plan = null;
  } else if (remoteDeclared && ds) {
    data.remote_plan = buildRemotePlan(query, ds, config?.workspace.domain ?? "general");
  } else {
    data.remote_plan = null;
    data.remote_note = "未声明在线文档系统，本次仅完成本地检索。";
  }

  return okResult(data);
}
