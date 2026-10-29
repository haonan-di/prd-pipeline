/**
 * generate 工具（契约 §4 E1/E3 / §4.3 / §4.4）
 * 关键修正：模板占位符与入参键严格对齐（旧实现二者脱节，产物留 {花括号}）。
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config.js";
import { HostPathError } from "../paths.js";
import { getPresetByName } from "../presets/loader.js";
import { TemplatePreset } from "../contracts/index.js";
import { renderTemplate, findUnresolvedPlaceholders } from "../contracts/template.js";
import {
  resolveWorkspaceRoot,
  slugify,
  ensureTask,
  writeState,
  taskDir,
} from "../task.js";
import { okResult, failResult } from "../envelope.js";

export const GENERATE_TOOL = {
  name: "prd/generate",
  description:
    "按模板渲染生成 PRD，落盘到任务目录 prd-v<版本>.md。sections 键必须覆盖模板声明的必填占位符。",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      slug: { type: "string", description: "可选；默认由 title 派生" },
      template: { type: "string", description: "模板预设名，默认取 config.workspace.template" },
      sections: {
        type: "object",
        description: "章节内容，键须匹配模板 frontmatter.placeholders",
        additionalProperties: { type: "string" },
      },
      diagrams: {
        type: "array",
        description: "待嵌入图，placement 指向某个章节键（默认 details）",
        items: {
          type: "object",
          properties: {
            placement: { type: "string" },
            source: { type: "string", description: "图源码（mermaid 等）" },
            caption: { type: "string" },
          },
          required: ["source"],
        },
      },
      version: { type: "string", default: "1.0" },
      changelog: { type: "string", description: "修订内容（填入修订记录）" },
      author: { type: "string", description: "修订人" },
      workspace_root: { type: "string" },
    },
    required: ["title"],
  },
} as const;

export function handleGenerate(args: Record<string, unknown>) {
  try {
    const title = (args.title as string) ?? "";
    if (title.trim() === "") return failResult("INVALID_INPUT", "缺少标题 title");

    const config = readConfig()?.config;
    const templateName =
      (args.template as string) || config?.workspace.template || "standard";
    const found = getPresetByName(templateName, { presetDirs: config?.preset_dirs ?? [], type: "template" });
    if (!found || found.type !== "template") {
      return failResult(
        "TEMPLATE_NOT_FOUND",
        `模板「${templateName}」不存在或不是模板`,
        "用 prd/preset.list 查看可用模板"
      );
    }

    const parsed = TemplatePreset.safeParse(found.frontmatter);
    if (!parsed.success) {
      return failResult("PRESET_INVALID", `模板 frontmatter 非法：${parsed.error.message}`);
    }
    const placeholders = parsed.data.placeholders;

    const sections = (args.sections as Record<string, string>) ?? {};
    const warnings: string[] = [];

    // 1. 必填占位符校验（契约 §4.3）
    const missing = placeholders
      .filter((p) => p.required && sections[p.key] === undefined)
      .map((p) => p.key);
    if (missing.length > 0) {
      return failResult(
        "PLACEHOLDER_MISSING",
        `缺少必填章节：${missing.join(", ")}`,
        "每个 required 占位符都需在 sections 中提供（可为空串）"
      );
    }

    // 2. 未声明键告警
    const declared = new Set(placeholders.map((p) => p.key));
    for (const k of Object.keys(sections)) {
      if (!declared.has(k)) warnings.push(`sections 中的「${k}」未在模板声明，被忽略`);
    }

    // 3. 嵌入图到对应章节
    const effective: Record<string, string> = { ...sections };
    const diagrams = (args.diagrams as Array<{ placement?: string; source: string; caption?: string }>) ?? [];
    for (const d of diagrams) {
      const key = d.placement || "details";
      const block = `\n\n### ${d.caption ?? "图示"}\n\n\`\`\`mermaid\n${d.source}\n\`\`\`\n`;
      if (!declared.has(key)) {
        warnings.push(`图 placement「${key}」不在模板占位符中，已追加到文档末尾`);
        effective[key] = (effective[key] ?? "") + block;
        continue;
      }
      effective[key] = (effective[key] ?? "") + block;
    }

    // 4. 版本历史 + 修订记录（先解析任务目录，因为修订记录要基于历史累积）
    const version = (args.version as string) || "1.0";
    const date = new Date().toISOString().slice(0, 10);
    const author = (args.author as string) || config?.workspace.soul || "";
    const changelog = (args.changelog as string) || "初版";

    const root = resolveWorkspaceRoot((args.workspace_root as string) || config?.workspace_root);
    const slug = (args.slug as string) || slugify(title);
    const task = ensureTask(root, slug, title, date);
    const dir = taskDir(root, slug);

    const versions = [...task.state.versions];
    const entry = { version, date, changelog, author };
    const existingIdx = versions.findIndex((v) => v.version === version);
    if (existingIdx >= 0) versions[existingIdx] = entry;
    else versions.push(entry);

    const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const changelogTable = versions
      .map((v) => `| v${v.version} | ${v.date} | ${cell(v.changelog)} | ${cell(v.author)} |`)
      .join("\n");

    const variables: Record<string, string> = {
      title,
      version,
      date,
      author,
      changelog,
      changelog_table: changelogTable,
      ...effective,
    };

    let rendered = renderTemplate(found.body, variables);

    // 为未声明的图 placement 追加到末尾
    for (const d of diagrams) {
      const key = d.placement || "details";
      if (!declared.has(key)) {
        rendered += `\n\n### ${d.caption ?? "图示"}\n\n\`\`\`mermaid\n${d.source}\n\`\`\`\n`;
      }
    }

    // 5. 残留占位符检出（契约 §4.4）
    const unresolved = findUnresolvedPlaceholders(rendered);
    if (unresolved.length > 0) {
      return failResult(
        "PLACEHOLDER_UNRESOLVED",
        `渲染后仍残留占位符：${unresolved.join(", ")}`,
        "检查模板占位符与 sections 是否对齐"
      );
    }

    // 6. 落盘任务目录（版本历史一并写入）
    // 同版本视为同一修订：覆盖原文件（与 state.versions 按版本覆盖的语义一致），
    // 内容有变化时提醒版本号未递增，避免磁盘上留下 -2 副本而状态只有一条。
    const filename = `prd-v${version}.md`;
    const file = join(dir, filename);
    const existedBefore = existsSync(file);
    const previous = existedBefore ? readFileSync(file, "utf-8") : null;
    writeFileSync(file, rendered, "utf-8");

    if (existedBefore) {
      warnings.push(`版本 v${version} 已存在，已覆盖原文件`);
      if (previous !== rendered) {
        warnings.push(`内容与上一版不同但版本号未递增（仍为 v${version}）；如需保留历史请递增版本号`);
      }
    }

    writeState(dir, {
      ...task.state,
      updated: date,
      current_prd_version: version,
      versions,
    });

    return okResult({
      title,
      slug,
      template: templateName,
      version,
      file,
      word_count: rendered.length,
      sections_present: Object.keys(sections),
      diagrams_embedded: diagrams.length,
      overwritten: existedBefore,
      warnings,
      content: rendered,
    });
  } catch (error) {
    if (error instanceof HostPathError) {
      return failResult(
        "INVALID_INPUT",
        error.message,
        "检查 config.workspace_root 是否为运行 server 的机器上的有效路径（跨平台路径会被拒绝）"
      );
    }
    return failResult("IO_ERROR", `生成失败：${String(error)}`);
  }
}
