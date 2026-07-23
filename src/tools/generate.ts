/** PRD 撰写 — prd/generate */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config.js";
import { renderTemplate } from "../writer.js";
import type { DiagramResult } from "../types.js";

const PRESETS_DIR = join(import.meta.dirname, "..", "..", "presets");

export const GENERATE_TOOL = {
  name: "prd/generate",
  description:
    "Generate a PRD document from discussion summary and template. Returns the rendered PRD markdown content.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "PRD title",
      },
      template: {
        type: "string",
        description: "Template name (standard, iteration) — defaults to workspace config",
      },
      sections: {
        type: "object",
        description:
          "Section content. Keys match template placeholders. See template for available sections.",
        properties: {
          background: { type: "string", description: "需求背景" },
          objectives: { type: "string", description: "目标和收益" },
          details: { type: "string", description: "需求详述" },
          grayscale: { type: "string", description: "灰度方案" },
          compliance: { type: "string", description: "合规/风险披露" },
          appendix: { type: "string", description: "附录" },
        },
      },
      diagrams: {
        type: "array",
        description: "Diagrams to embed in the PRD",
        items: {
          type: "object",
          properties: {
            placement: { type: "string", description: "Where to place the diagram (e.g., 'details', 'appendix')" },
            mermaid: { type: "string", description: "Mermaid code" },
            caption: { type: "string", description: "Diagram caption" },
          },
        },
      },
      version: {
        type: "string",
        description: "PRD version (for iteration templates)",
      },
    },
    required: ["title"],
  },
} as const;

/** 获取模板内容 */
function loadTemplate(name: string): string | null {
  const templatePath = join(PRESETS_DIR, "templates", `${name}.md`);
  if (!existsSync(templatePath)) return null;
  return readFileSync(templatePath, "utf-8");
}

/** 生成 Confluence 兼容的流程图 HTML */
function diagramToConfluenceHtml(mermaidCode: string, caption: string): string {
  const { encodeMermaidInkUrl } = require("../diagram/ink.js");
  const url = encodeMermaidInkUrl(mermaidCode);
  return `<p><ac:image ac:width="600"><ri:url ri:value="${url}" /></ac:image></p>
<p><span style="color: rgb(193,199,208);">${caption}</span></p>`;
}

export function handleGenerate(args: Record<string, unknown>): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  try {
    const title = args.title as string;
    const templateName = (args.template as string) || readConfig()?.workspace.template || "standard";
    const sections = (args.sections as Record<string, string>) || {};
    const diagrams = (args.diagrams as Array<{ placement: string; mermaid: string; caption: string }>) || [];
    const version = args.version as string | undefined;

    // 加载模板
    const template = loadTemplate(templateName);
    if (!template) {
      return {
        content: [{ type: "text", text: `Template "${templateName}" not found.` }],
        isError: true,
      };
    }

    // 处理图表嵌入
    let detailsSection = sections.details || "";
    for (const d of diagrams) {
      if (d.placement === "details" || !d.placement) {
        detailsSection += `\n\n### ${d.caption}\n\n\`\`\`mermaid\n${d.mermaid}\n\`\`\`\n`;
      }
    }

    // 渲染模板
    const variables: Record<string, string> = {
      ...sections,
      details: detailsSection,
      需求名称: title,
      版本号: version || "1.0",
      日期: new Date().toLocaleDateString("zh-CN"),
      PM: readConfig()?.workspace.soul || "",
    };

    const rendered = renderTemplate(template, variables);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              title,
              template: templateName,
              content: rendered,
              word_count: rendered.length,
              sections_present: Object.keys(sections),
              diagrams_embedded: diagrams.length,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error generating PRD: ${error}` }],
      isError: true,
    };
  }
}
