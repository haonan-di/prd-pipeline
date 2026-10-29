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
  /** 相关性得分，仅用于排序；不跨查询比较 */
  score: number;
  /** 命中的位置，让 agent 知道"为什么排在这里" */
  matched_in: Array<"title" | "path" | "body">;
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

/**
 * 相关性权重（C4）。
 *
 * 中文没有分词，所以以「整串命中」为主、以「空格分词全命中」为辅：
 * 整串命中按权重给分，分词命中降档。标题/路径的命中远比正文一次提及重要——
 * 一份标题就叫「收款台改造」的文档，相关性天然高于正文里顺带提一句的文档。
 */
const W_TITLE_PHRASE = 10;
const W_TITLE_TOKENS = 6;
const W_PATH_PHRASE = 4;
const W_PATH_TOKENS = 2;
const BODY_HIT_CAP = 5; // 正文命中最多计 5 分，避免长文档靠刷词堆分

function splitTokens(query: string): string[] {
  const seen = new Set<string>();
  for (const t of query.toLowerCase().split(/\s+/)) {
    const s = t.trim();
    if (s !== "") seen.add(s);
  }
  return [...seen];
}

/** 某一行里出现了多少个查询词（用于挑最佳摘要行） */
function lineHits(line: string, tokens: string[]): number {
  const low = line.toLowerCase();
  let n = 0;
  for (const t of tokens) if (low.includes(t)) n += 1;
  return n;
}

function searchLocal(query: string, limit: number, dir: string): SearchHit[] {
  const hits: SearchHit[] = [];
  if (!existsSync(dir)) return hits;
  const needle = query.toLowerCase();
  const tokens = splitTokens(query);

  for (const file of collectMdFiles(dir)) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const lowContent = content.toLowerCase();

    // 入选条件：整串命中，或查询词全部出现（AND 而非 OR——只要命一个词就返回会淹掉结果）
    const phraseInContent = lowContent.includes(needle);
    const allTokensInContent = tokens.length > 0 && tokens.every((t) => lowContent.includes(t));
    if (!phraseInContent && !allTokensInContent) continue;

    const lines = content.split("\n");
    let titleIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("# ")) {
        titleIdx = i;
        break;
      }
    }
    const title = titleIdx >= 0 ? lines[titleIdx].replace(/^#\s+/, "").trim() : file;
    const lowTitle = title.toLowerCase();
    const lowPath = file.toLowerCase();

    const matchedIn: SearchHit["matched_in"] = [];
    let score = 0;

    if (lowTitle.includes(needle)) {
      score += W_TITLE_PHRASE;
      matchedIn.push("title");
    } else if (tokens.length > 0 && tokens.every((t) => lowTitle.includes(t))) {
      score += W_TITLE_TOKENS;
      matchedIn.push("title");
    }

    if (lowPath.includes(needle)) {
      score += W_PATH_PHRASE;
      matchedIn.push("path");
    } else if (tokens.length > 0 && tokens.every((t) => lowPath.includes(t))) {
      score += W_PATH_TOKENS;
      matchedIn.push("path");
    }

    // 正文命中：只看标题行以下，避免标题的命中被重复计分
    const bodyLines = titleIdx >= 0 ? lines.slice(titleIdx + 1) : lines;
    const bodyText = bodyLines.join("\n").toLowerCase();
    let bodyHits = 0;
    if (phraseInContent) {
      let from = 0;
      while (true) {
        const at = bodyText.indexOf(needle, from);
        if (at === -1) break;
        bodyHits += 1;
        from = at + needle.length;
        if (bodyHits >= BODY_HIT_CAP) break;
      }
    }
    if (bodyHits > 0) {
      score += Math.min(bodyHits, BODY_HIT_CAP);
      matchedIn.push("body");
    } else if (allTokensInContent && !phraseInContent) {
      // 整串没出现、但查询词都在正文里：给最低一档分，排在同分文档里靠前
      score += 1;
      matchedIn.push("body");
    }

    // 摘要落在命中最密的那一行，而不是文件里第一次出现的位置
    let bestLine = 0;
    let bestHits = -1;
    for (let i = 0; i < lines.length; i++) {
      const n = lineHits(lines[i], tokens);
      if (n > bestHits && n > 0) {
        bestHits = n;
        bestLine = i;
      }
    }
    const snippet =
      bestHits > 0
        ? lines.slice(Math.max(0, bestLine - 1), bestLine + 2).join("\n").slice(0, 240)
        : content.slice(0, 240);

    hits.push({ title, path: file, snippet, source: "local", score, matched_in: matchedIn });
  }

  // 分数降序；同分按路径升序，保证同一份 vault 每次检索顺序一致
  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return hits.slice(0, limit);
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
  const rawLimit = Number(args.limit ?? 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 10;
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
