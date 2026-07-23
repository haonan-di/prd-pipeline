/** 模板管理 — prd/template.list, prd/template.get */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { PrdTemplate } from "../types.js";

const TEMPLATES_DIR = join(import.meta.dirname, "..", "..", "presets", "templates");

/** 模板元数据（从文件名推断） */
const TEMPLATE_META: Record<string, { name: string; description: string }> = {
  standard: {
    name: "standard",
    description: "标准 PRD 模板 — 适用于完整需求文档，包含背景、目标、详述、灰度、合规等章节",
  },
  iteration: {
    name: "iteration",
    description: "迭代 PRD 模板 — 适用于现有 PRD 的增量迭代，仅描述变更部分，关联父文档",
  },
};

/** 获取模板列表 */
export const TEMPLATE_LIST_TOOL = {
  name: "prd/template.list",
  description: "List available PRD templates",
  inputSchema: {
    type: "object",
    properties: {},
  },
} as const;

/** 获取单个模板内容 */
export const TEMPLATE_GET_TOOL = {
  name: "prd/template.get",
  description: "Get a specific PRD template content",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Template name — e.g. standard, iteration",
      },
    },
    required: ["name"],
  },
} as const;

/** 扫描 presets/templates/ 下的模板文件 */
function scanTemplates(): PrdTemplate[] {
  if (!existsSync(TEMPLATES_DIR)) {
    return [];
  }
  const files = readdirSync(TEMPLATES_DIR);
  return files
    .filter((f) => extname(f) === ".md")
    .map((f) => {
      const name = basename(f, ".md");
      const meta = TEMPLATE_META[name] || { name, description: "" };
      const content = readFileSync(join(TEMPLATES_DIR, f), "utf-8");
      return { ...meta, content };
    });
}

export function handleTemplateList(): {
  content: { type: string; text: string }[];
} {
  const templates = scanTemplates();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          templates.map((t) => ({
            name: t.name,
            description: t.description,
          })),
          null,
          2
        ),
      },
    ],
  };
}

export function handleTemplateGet(args: Record<string, unknown>): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  const name = args.name as string;
  const templates = scanTemplates();
  const template = templates.find((t) => t.name === name);

  if (!template) {
    const available = templates.map((t) => t.name).join(", ");
    return {
      content: [
        {
          type: "text",
          text: `Template "${name}" not found. Available: ${available}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(template, null, 2),
      },
    ],
  };
}
