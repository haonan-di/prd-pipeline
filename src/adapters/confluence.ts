/** Confluence 发布适配器 — 生成 Confluence Storage Format + 通用 MCP 指令 */

import type { PublishAdapter, PublishMetadata, PublishResult } from "./base.js";
import { readConfig } from "../config.js";
import { encodeMermaidInkUrl } from "../diagram/ink.js";

/**
 * Confluence 适配器
 *
 * 不绑定任何特定 MCP 服务器。使用 workspace 配置中的 doc_mcp_server 名称
 * 来生成通用指令，由 agent 调用用户配置的文档系统 MCP 执行实际发布。
 */
export class ConfluenceAdapter implements PublishAdapter {
  readonly type = "confluence" as const;

  async publish(metadata: PublishMetadata): Promise<PublishResult> {
    try {
      const config = readConfig();
      const mcpServerName = config?.document_system?.mcp_server || "your-document-mcp";

      const htmlBody = this.markdownToConfluenceHtml(metadata.content);

      const pageTitle = metadata.title;
      const space = metadata.space || config?.document_system?.space || "";
      const parentId = metadata.parent_id;

      // 生成通用 MCP 指令（不绑定任何特定 MCP 服务器）
      let commands: string[];
      if (parentId) {
        // 迭代 PRD：创建子页面
        commands = [
          `1. Call ${mcpServerName} to verify connection (e.g., connection_status or equivalent)`,
          `2. Call ${mcpServerName} to get parent page: parentId="${parentId}"`,
          `3. Call ${mcpServerName} to create a CHILD page under parentId="${parentId}":`,
          `   - space="${space}"`,
          `   - title="${pageTitle}"`,
          `   - body = the HTML content below (Confluence Storage Format)`,
        ];
      } else {
        // 标准 PRD：创建新页面
        commands = [
          `1. Call ${mcpServerName} to verify connection`,
          `2. Call ${mcpServerName} to create a page:`,
          `   - space="${space}"`,
          `   - title="${pageTitle}"`,
          `   - body = the HTML content below (Confluence Storage Format)`,
        ];
      }

      return {
        success: true,
        message: `Confluence publish prepared. Your agent will use "${mcpServerName}" MCP server to create the page.`,
        url: `[Page "${pageTitle}" ready for creation in space "${space}" via ${mcpServerName}]`,
        html_body: htmlBody,
        page_id: parentId,
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
