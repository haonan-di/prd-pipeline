/** Confluence 发布适配器 — 生成 Confluence Storage Format + wiki-mcp 指令 */

import type { PublishAdapter, PublishMetadata, PublishResult } from "./base.js";
import { encodeMermaidInkUrl } from "../diagram/ink.js";

/**
 * Confluence 适配器
 *
 * 注意：此适配器不能直接调用 wiki-mcp MCP Server（MCP 服务器之间不能互相调用）。
 * 它负责：
 * 1. 将 PRD Markdown 转换为 Confluence Storage Format (HTML)
 * 2. 返回格式化后的内容和 wiki-mcp 指令，由 agent 执行实际发布
 */
export class ConfluenceAdapter implements PublishAdapter {
  readonly type = "confluence" as const;

  async publish(metadata: PublishMetadata): Promise<PublishResult> {
    try {
      const htmlBody = this.markdownToConfluenceHtml(metadata.content);

      const instructions = {
        action: metadata.parent_id ? "create_child" : "create_page",
        space: metadata.space || "",
        title: metadata.title,
        parent_id: metadata.parent_id,
        body: htmlBody,
        wiki_mcp_commands: [
          `1. Call mcp_wiki_mcp_get_connection_status() to verify connection`,
          `2. Call mcp_wiki_mcp_get_page(pageId="${metadata.parent_id || ""}") to check parent page`,
          metadata.parent_id
            ? `3. Call mcp_wiki_mcp_create_page(space="${metadata.space}", title="${metadata.title}", parentId="${metadata.parent_id}", body=htmlBody)`
            : `3. Call mcp_wiki_mcp_create_page(space="${metadata.space}", title="${metadata.title}", body=htmlBody)`,
        ],
      };

      return {
        success: true,
        message: `Confluence publish prepared. Agent should execute wiki-mcp commands.`,
        url: `[Confluence page will be created in space "${metadata.space}"]`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to prepare Confluence publish: ${error}`,
      };
    }
  }

  /** 将 PRD Markdown 转换为 Confluence Storage Format (HTML) */
  private markdownToConfluenceHtml(markdown: string): string {
    let html = markdown;

    // 标题
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");

    // Mermaid 代码块 → mermaid.ink 图片
    html = html.replace(
      /```mermaid\n([\s\S]*?)```/g,
      (_, code) => {
        try {
          const url = encodeMermaidInkUrl(code.trim(), "svg");
          return `<p><ac:image ac:width="600"><ri:url ri:value="${url}" /></ac:image></p>`;
        } catch {
          return `<pre>${code}</pre>`;
        }
      }
    );

    // 表格
    html = html.replace(
      /\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g,
      (_, headerRow, bodyRows) => {
        const headers = headerRow
          .split("|")
          .map((h: string) => h.trim())
          .filter(Boolean);
        const rows = bodyRows
          .trim()
          .split("\n")
          .map((r: string) =>
            r
              .split("|")
              .map((c: string) => c.trim())
              .filter(Boolean)
          );

        let table = '<table class="fixed-width wrapped"><colgroup>';
        table += headers.map(() => '<col style="width: 20%;" />').join("");
        table +=
          '</colgroup><tbody><tr>' +
          headers.map((h: string) => `<th>${h}</th>`).join("") +
          "</tr>";
        for (const row of rows) {
          table +=
            "<tr>" +
            row.map((c: string) => `<td>${c}</td>`).join("") +
            "</tr>";
        }
        table += "</tbody></table>";
        return table;
      }
    );

    // 加粗
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // 行内代码
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // 段落（剩余文本）
    html = html.replace(/^(?!<[hHpPtaAcC])(.+)$/gm, "<p>$1</p>");

    // 移除空标签
    html = html.replace(/<p>\s*<\/p>/g, "");

    return html;
  }
}
