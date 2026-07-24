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

/** 本地搜索：使用 ripgrep 或 grep 搜索指定目录下的 MD 文件 */
function searchLocal(query: string, limit: number, searchDir?: string): SearchResult[] {
  const results: SearchResult[] = [];
  // 优先使用配置的文档路径，兜底当前工作目录
  let cwd = searchDir || process.cwd();
  // 标准化路径分隔符
  cwd = cwd.replace(/\\/g, "/");

  if (!existsSync(cwd)) {
    return results;
  }

  try {
    // 优先使用 ripgrep (rg)，更快
    let cmd: string;
    try {
      execSync("rg --version 2>nul || where rg 2>nul", {
        stdio: "ignore",
        timeout: 2000,
      });
      cmd = `rg -l -i "${query.replace(/"/g, '\\"')}" --glob "*.md" "${cwd}" 2>nul`;
    } catch {
      // 其次使用 grep (通过 bash -c，因为 grep 在 Git Bash 里)
      try {
        // 检查 grep 是否可用（通过 where 命令，在 Windows cmd 中有效）
        execSync("where grep 2>nul", { stdio: "ignore", timeout: 2000 });
        // 通过 bash -c 执行 grep，确保中文路径和字符正确处理
        cmd = `bash -c "grep -r -l -i ${query} ${cwd} --include=*.md 2>/dev/null"`;
      } catch {
        // Windows 兜底：findstr（不支持中文，但保底）
        cmd = `findstr /s /m /i /c:"${query}" "${cwd}\\*.md" 2>nul`;
      }
    }

    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "ignore"],
    });

    const files = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(0, limit);

    for (const file of files) {
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
