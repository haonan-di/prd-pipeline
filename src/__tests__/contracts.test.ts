/**
 * L1（契约）+ L2（纯函数）测试 —— 对应 CONTRACTS.md §9
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { inflateSync } from "node:zlib";
import {
  WorkspaceConfigV3,
  migrateToV3,
  TaskState,
  TemplatePreset,
  StagesPreset,
  Preset,
  PresetListItem,
  renderTemplate,
  findUnresolvedPlaceholders,
  hasUnresolvedPlaceholders,
  encodeMermaidInkUrl,
  DiagramBuildResult,
  okEnvelope,
  ToolEnvelope,
  Probe,
} from "../contracts/index.js";

describe("L1 · config v3", () => {
  it("空输入补全默认值", () => {
    const c = WorkspaceConfigV3.parse({ version: 3 });
    expect(c.status).toBe("active");
    expect(c.workspace.template).toBe("standard");
    expect(c.workspace.domain).toBe("general");
    expect(c.workspace.product_form).toBe("c-end");
    expect(c.document_system.type).toBe("local");
    expect(c.document_system.mode).toBe("local_first");
    expect(c.document_system.local.subdir).toBe("PRD");
    expect(c.diagram.render).toBe("ask");
    expect(c.diagram.default_engine).toBe("mermaid");
    expect(c.preset_dirs).toEqual([]);
  });

  it("拒绝未知文档系统类型", () => {
    expect(WorkspaceConfigV3.safeParse({ version: 3, document_system: { type: "dropbox" } }).success).toBe(false);
  });

  it("拒绝错误 version 字面量", () => {
    expect(WorkspaceConfigV3.safeParse({ version: 2 }).success).toBe(false);
  });
});

describe("L2 · config 迁移 v1/v2 → v3", () => {
  it("迁移 v1 扁平结构", () => {
    const v1 = {
      version: 1,
      workspace: { domain: "fintech", soul: "c-end-pm", template: "standard" },
      document_system: { type: "confluence", mcp_server: "wiki-mcp", space: "FINT" },
      search: { recent_spaces: [], recent_keywords: ["合规"] },
    };
    const { config, migrated } = migrateToV3(v1);
    expect(migrated).toBe(true);
    expect(config.version).toBe(3);
    expect(config.document_system.type).toBe("confluence");
    expect(config.document_system.remote.mcp_server).toBe("wiki-mcp");
    expect(config.document_system.remote.space).toBe("FINT");
    expect(config.document_system.remote.platform).toBe("confluence");
    expect(config.search.recent_keywords).toEqual(["合规"]);
  });

  it("local_path → local.vault_path", () => {
    const { config } = migrateToV3({ version: 2, document_system: { type: "local", local_path: "D:/vault" } });
    expect(config.document_system.local.vault_path).toBe("D:/vault");
  });

  it("已是 v3 时 migrated=false", () => {
    expect(migrateToV3({ version: 3, workspace: { domain: "x" } }).migrated).toBe(false);
  });
});

describe("L2 · 模板 ↔ sections 契约", () => {
  it("替换变量", () => {
    expect(renderTemplate("Hello {{name}}", { name: "World" })).toBe("Hello World");
  });

  it("未定义变量保留原样以便检出", () => {
    const out = renderTemplate("# {{title}}\n\n{{details}}", { title: "T" });
    expect(out).toContain("# T");
    expect(hasUnresolvedPlaceholders(out)).toBe(true);
    expect(findUnresolvedPlaceholders(out)).toEqual(["details"]);
  });

  it("条件块：有值保留", () => {
    expect(renderTemplate("a{{#x}}B{{/x}}c", { x: "1" })).toBe("aBc");
  });

  it("条件块：空值/缺失整块移除", () => {
    expect(renderTemplate("a{{#x}}B{{/x}}c", {})).toBe("ac");
    expect(renderTemplate("a{{#x}}B{{/x}}c", { x: "" })).toBe("ac");
  });

  it("完整渲染后无残留占位符", () => {
    const tpl = "# {{title}}\n{{details}}\n{{#extra}}E{{/extra}}";
    const out = renderTemplate(tpl, { title: "T", details: "D" });
    expect(hasUnresolvedPlaceholders(out)).toBe(false);
  });
});

describe("L1/L2 · 预设契约", () => {
  it("解析 template 预设（required 默认 true）", () => {
    const t = TemplatePreset.parse({
      name: "standard",
      type: "template",
      placeholders: [{ key: "background", label: "背景" }, { key: "details", required: false }],
    });
    expect(t.placeholders[0].required).toBe(true);
    expect(t.placeholders[1].required).toBe(false);
  });

  it("stages 预设缺字段被拒", () => {
    expect(StagesPreset.safeParse({ name: "s", type: "stages", stages: [{ id: "problem" }] }).success).toBe(false);
  });

  it("判别联合按 type 路由", () => {
    expect(Preset.parse({ name: "fintech", type: "domain" }).type).toBe("domain");
  });

  it("拒绝未知预设类型", () => {
    expect(Preset.safeParse({ name: "x", type: "unknown" }).success).toBe(false);
  });

  it("preset 列表项 source 枚举受限", () => {
    const item = PresetListItem.parse({ type: "template", name: "standard", source: "builtin", path: "p" });
    expect(item.description).toBe("");
    expect(PresetListItem.safeParse({ type: "template", name: "s", source: "nope", path: "p" }).success).toBe(false);
  });
});

describe("L2 · 图表编码（修正后的 mermaid.ink）", () => {
  it("URL 为 JSON 包装并可按 zlib 还原", () => {
    const code = "graph TD\n  A[开始] --> B[结束]";
    const url = encodeMermaidInkUrl(code);
    expect(url.startsWith("https://mermaid.ink/svg/")).toBe(true);
    const b64 = url.split("/svg/")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(inflateSync(Buffer.from(b64, "base64")).toString("utf-8"));
    expect(payload.code).toBe(code);
    expect(payload.mermaid.theme).toBe("default");
  });
});

describe("L1 · 工具信封", () => {
  it("成功信封结构", () => {
    const env = okEnvelope(z.object({ a: z.number() })).parse({ ok: true, data: { a: 1 } });
    expect(env.data.a).toBe(1);
  });

  it("失败信封由联合识别", () => {
    const parsed = ToolEnvelope.parse({ ok: false, error: { code: "IO_ERROR", message: "boom" } });
    expect(parsed.ok).toBe(false);
  });

  it("错误码受限", () => {
    expect(ToolEnvelope.safeParse({ ok: false, error: { code: "NOPE", message: "x" } }).success).toBe(false);
  });
});

describe("L1 · 任务状态与探针", () => {
  it("state.yaml 补全默认", () => {
    const s = TaskState.parse({ slug: "x", title: "X", created: "2026-10-15", updated: "2026-10-15" });
    expect(s.version).toBe(1);
    expect(s.stages.completed).toEqual([]);
  });

  it("探针 allow_open 默认 false、recommended 默认 false", () => {
    const p = Probe.parse({ id: "p1", stage: "problem", question: "谁是用?", options: [{ label: "A", value: "a" }] });
    expect(p.allow_open).toBe(false);
    expect(p.options?.[0].recommended).toBe(false);
  });

  it("图表结果结构", () => {
    const r = DiagramBuildResult.parse({ source: "graph TD", source_format: "mermaid", strategy_used: "source" });
    expect(r.warnings).toEqual([]);
  });
});
