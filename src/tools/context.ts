/** 上下文搜索 — prd/context.search */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { readConfig } from "../config.js";

export const CONTEXT_SEARCH_TOOL = {
  name: "prd/context.search",
  description:
    "Search historical PRDs, technical designs, and related documents. Supports local workspace search. For Confluence search, the agent should use the wiki-mcp search tool directly.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query — keywords, phrases, or topics to find",
      },
      scope: {
        type: "string",
        enum: ["local", "confluence", "auto"],
        description:
          "Search scope. 'auto' uses the configured document system. 'local' searches workspace files.",
        default: "auto",
      },
      limit: {
        type: "number",
        description: "Maximum results to return",
        default: 10,
      },
    },
    required: ["query"],
  },
} as const;

interface SearchResult {
  title: string;
  path: string;
  snippet: string;
  source: string;
}

/** 本地搜索：使用 ripgrep 或 grep 搜索 MD 文件 */
function searchLocal(query: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const cwd = process.cwd();

  try {
    // 优先使用 ripgrep (rg)，更快
    let hasRg = false;
    try {
      execSync("which rg 2>/dev/null || where rg 2>nul", {
        stdio: "ignore",
        timeout: 2000,
      });
      hasRg = true;
    } catch {
      hasRg = false;
    }

    let cmd: string;
    if (hasRg) {
      cmd = `rg -l -i "${query.replace(/"/g, '\\"')}" --glob '*.md' "${cwd}" 2>/dev/null | head -${limit}`;
    } else {
      // Windows: findstr
      cmd = `findstr /s /m /i /c:"${query}" "${cwd}\\*.md" 2>nul | head -${limit}`;
    }

    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "ignore"],
    });

    const files = stdout
      .trim()
      .split("\n")
      .filter(Boolean);

    for (const file of files.slice(0, limit)) {
      if (!existsSync(file)) continue;

      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      // 提取标题
      const titleLine = lines.find((l) => l.startsWith("# "));
      const title = titleLine
        ? titleLine.replace(/^# /, "").trim()
        : file;

      // 提取匹配片段
      const matchIdx = lines.findIndex((l) =>
        l.toLowerCase().includes(query.toLowerCase())
      );
      const snippetStart = Math.max(0, matchIdx - 1);
      const snippetEnd = Math.min(lines.length, matchIdx + 3);
      const snippet = lines
        .slice(snippetStart, snippetEnd)
        .join("\n")
        .slice(0, 200);

      results.push({
        title,
        path: file,
        snippet: snippet || "(matched in filename)",
        source: "local",
      });
    }
  } catch {
    // 搜索失败时返回空结果
  }

  return results;
}

export function handleContextSearch(
  args: Record<string, unknown>
): { content: { type: string; text: string }[]; isError?: boolean } {
  const query = args.query as string;
  const scope = (args.scope as string) || "auto";
  const limit = (args.limit as number) || 10;

  if (!query || query.trim() === "") {
    return {
      content: [{ type: "text", text: "Search query is required." }],
      isError: true,
    };
  }

  // 确定搜索范围
  let effectiveScope = scope;
  if (effectiveScope === "auto") {
    const config = readConfig();
    effectiveScope = config?.document_system?.type || "local";
  }

  if (effectiveScope === "local") {
    const results = searchLocal(query, limit);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ query, scope: effectiveScope, total: results.length, results }, null, 2),
        },
      ],
    };
  }

  if (effectiveScope === "confluence") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message:
                "Confluence search is available via the wiki-mcp MCP server. Use mcp_wiki_mcp_search with CQL query.",
              hint: `CQL: text ~ "${query}" ORDER BY lastmodified DESC`,
              fallback: "Or switch to local search with scope='local'",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          query,
          scope: effectiveScope,
          total: 0,
          results: [],
          message: `Unknown scope: ${effectiveScope}. Use 'local' or 'confluence'.`,
        }, null, 2),
      },
    ],
  };
}
