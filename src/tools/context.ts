/** 上下文搜索 — prd/context.search */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
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

/** 递归收集目录下的所有 .md 文件 */
function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过隐藏目录和 node_modules
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          results.push(...collectMdFiles(fullPath));
        }
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // 跳过无权限的目录
  }
  return results;
}

/** 纯 Node.js 本地搜索 — 不依赖外部命令，无 shell 注入风险 */
function searchLocal(query: string, limit: number, searchDir?: string): SearchResult[] {
  const results: SearchResult[] = [];
  const cwd = searchDir || process.cwd();

  if (!existsSync(cwd)) {
    return results;
  }

  const lowerQuery = query.toLowerCase();

  try {
    const mdFiles = collectMdFiles(cwd);

    for (const file of mdFiles) {
      if (results.length >= limit) break;

      let content: string;
      try {
        content = readFileSync(file, "utf-8");
      } catch {
        continue; // 跳过无法读取的文件
      }

      const lines = content.split("\n");

      // 检查是否匹配（大小写不敏感）
      const matchIdx = lines.findIndex((l) =>
        l.toLowerCase().includes(lowerQuery)
      );

      if (matchIdx === -1) continue;

      // 提取标题
      const titleLine = lines.find((l) => l.startsWith("# "));
      const title = titleLine
        ? titleLine.replace(/^# /, "").trim()
        : file;

      // 提取匹配片段
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
    const config = readConfig();
    const searchDir = config?.document_system?.local_path;
    const results = searchLocal(query, limit, searchDir);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query,
              scope: effectiveScope,
              search_path: searchDir || process.cwd(),
              total: results.length,
              results,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (effectiveScope === "confluence") {
    const config = readConfig();
    const mcpName = config?.document_system?.mcp_server || "your-document-mcp";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: `Confluence search is available via your configured "${mcpName}" MCP server. Use its search tool with a relevant query.`,
              hint: `Example CQL: text ~ "${query}" ORDER BY lastmodified DESC`,
              configured_mcp: mcpName,
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
