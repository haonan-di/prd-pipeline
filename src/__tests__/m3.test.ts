/**
 * M3 知识层 —— 自定义预设覆盖 + 结构/一致性校验
 *
 * 目标：让"用户写自己的预设"这件事有护栏——放错目录、文件名对不上、
 * 模板占位符与正文脱节、id 重复、远程引擎缺地址，都要在 validate 阶段暴露，
 * 而不是等到 generate / diagram.build 运行时才报错。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validatePresetFile, validatePresetDir } from "../presets/validate.js";
import { BUILTIN_PRESETS_DIR } from "../presets/loader.js";
import { handleWorkspaceInit } from "../tools/workspace.js";
import { handlePresetList, handlePresetValidate, handlePresetGet } from "../tools/preset.js";

const parse = (r: any) => JSON.parse(r.content[0].text);

let work: string;
let custom: string;

const write = (typeDir: string, file: string, content: string): string => {
  const dir = join(custom, typeDir);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, file);
  writeFileSync(p, content, "utf-8");
  return p;
};

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-m3-"));
  process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
  custom = join(work, "custom");
  mkdirSync(custom, { recursive: true });
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.PRD_PIPELINE_CONFIG;
});

describe("内置预设自检", () => {
  it("六类 _template.md 全部通过校验", () => {
    const types = ["domains", "souls", "templates", "compliance", "stages", "diagrams"];
    for (const t of types) {
      const r = validatePresetFile(join(BUILTIN_PRESETS_DIR, t, "_template.md"));
      expect(r.errors, `${t}/_template.md 应无错误`).toEqual([]);
      expect(r.valid).toBe(true);
    }
  });

  it("所有内置预设文件均无错误", () => {
    const types = ["domains", "souls", "templates", "compliance", "stages", "diagrams"];
    for (const t of types) {
      for (const f of readdirSync(join(BUILTIN_PRESETS_DIR, t))) {
        if (!f.endsWith(".md")) continue;
        const r = validatePresetFile(join(BUILTIN_PRESETS_DIR, t, f));
        expect(r.errors, `${t}/${f} 应无错误`).toEqual([]);
      }
    }
  });
});

describe("结构与一致性校验", () => {
  it("文件放错目录 → 报错并指出应放目录", () => {
    const p = write("domains", "wrong.md", "---\nname: wrong\ntype: soul\nversion: 1\n---\n正文\n");
    const r = validatePresetFile(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("应放到 souls/"))).toBe(true);
  });

  it("name 与文件名不一致 → 仅告警", () => {
    const p = write("domains", "a.md", "---\nname: b\ntype: domain\nversion: 1\n---\n正文\n");
    const r = validatePresetFile(p);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.message.includes("与文件名"))).toBe(true);
  });

  it("模板正文用了未声明的占位符 → 报错", () => {
    const p = write(
      "templates",
      "t.md",
      "---\nname: t\ntype: template\nversion: 1\nplaceholders:\n  - { key: background, required: true }\n---\n{{background}}\n{{extra}}\n"
    );
    const r = validatePresetFile(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("{{extra}}"))).toBe(true);
  });

  it("模板声明了未使用的占位符 → 告警", () => {
    const p = write(
      "templates",
      "t.md",
      "---\nname: t\ntype: template\nversion: 1\nplaceholders:\n  - { key: background, required: true }\n  - { key: unused, required: false }\n---\n{{background}}\n"
    );
    const r = validatePresetFile(p);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.field.includes("unused"))).toBe(true);
  });

  it("generate 内置变量不需要声明", () => {
    const p = write(
      "templates",
      "t.md",
      "---\nname: t\ntype: template\nversion: 1\nplaceholders:\n  - { key: background, required: true }\n---\n# {{title}}\n| v{{version}} | {{date}} | {{changelog}} | {{author}} |\n{{background}}\n"
    );
    expect(validatePresetFile(p).errors).toEqual([]);
  });

  it("阶段 id 重复 → 报错", () => {
    const p = write(
      "stages",
      "s.md",
      "---\nname: s\ntype: stages\nversion: 1\nstages:\n  - { id: a, title: A, goal: g }\n  - { id: a, title: B, goal: g }\n---\n"
    );
    const r = validatePresetFile(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("阶段 id 重复"))).toBe(true);
  });

  it("未知 probe_ref → 告警（不阻断）", () => {
    const p = write(
      "stages",
      "s.md",
      "---\nname: s\ntype: stages\nversion: 1\nstages:\n  - { id: a, title: A, goal: g, probe_ref: custom-ref }\n---\n"
    );
    const r = validatePresetFile(p);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.message.includes("probe_ref"))).toBe(true);
  });

  it("图表引擎声明 remote 却缺 remote_url → 报错", () => {
    const p = write(
      "diagrams",
      "d.md",
      "---\nname: d\ntype: diagrams\nversion: 1\nengines:\n  - name: puml\n    source_format: plantuml\n    strategies: [remote]\n---\n"
    );
    const r = validatePresetFile(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("remote_url"))).toBe(true);
  });

  it("领域短关键词 → 告警（detect 会忽略）", () => {
    const p = write("domains", "d.md", "---\nname: d\ntype: domain\nversion: 1\nkeywords: [额, 支付]\n---\n正文\n");
    const r = validatePresetFile(p);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.message.includes("长度 < 2"))).toBe(true);
  });

  it("schema 错误优先返回，不再跑语义检查", () => {
    const p = write("domains", "d.md", "---\nname: d\ntype: domain\nversion: \"x\"\n---\n正文\n");
    const r = validatePresetFile(p);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("自定义目录与覆盖", () => {
  const seedOverride = () =>
    write("domains", "fintech.md", "---\nname: fintech\ntype: domain\ndescription: 自定义金融\nversion: 1\nkeywords: [支付]\n---\n# 自定义\n");

  it("自定义同名覆盖内置并标注 overrides_builtin", () => {
    seedOverride();
    parse(handleWorkspaceInit({ local_path: join(work, "vault"), workspace_root: join(work, ".prd"), preset_dirs: [custom] }));
    const list = parse(handlePresetList({ type: "domain" }));
    const fin = list.data.presets.find((p: any) => p.name === "fintech");
    expect(fin.source).toBe("custom");
    expect(fin.overrides_builtin).toBe(true);
    expect(list.data.summary.overridden_builtin).toContain("domain/fintech");
  });

  it("覆盖后 preset.get 读到自定义那份", () => {
    seedOverride();
    parse(handleWorkspaceInit({ local_path: join(work, "vault"), workspace_root: join(work, ".prd"), preset_dirs: [custom] }));
    const got = parse(handlePresetGet({ name: "fintech", type: "domain" }));
    expect(got.data.source).toBe("custom");
    expect(got.data.frontmatter.description).toBe("自定义金融");
  });

  it("preset_dirs 指向不存在的目录 → list 与 init 均告警", () => {
    const missing = join(work, "nope");
    const init = parse(handleWorkspaceInit({ local_path: join(work, "vault"), workspace_root: join(work, ".prd"), preset_dirs: [missing] }));
    expect(init.data.warnings.join("\n")).toContain("不存在");
    const list = parse(handlePresetList({}));
    expect(list.data.warnings.some((w: any) => w.message.includes("不存在"))).toBe(true);
  });

  it("批量校验目录：汇总逐文件结果", () => {
    seedOverride();
    write("domains", "wrong.md", "---\nname: wrong\ntype: soul\nversion: 1\n---\n正文\n");
    const r = parse(handlePresetValidate({ dir: custom }));
    expect(r.data.scanned).toBe(2);
    expect(r.data.valid).toBe(false);
    expect(r.data.errors.length).toBeGreaterThan(0);
  });

  it("目录不存在 → validate 返回明确错误", () => {
    const r = parse(handlePresetValidate({ dir: join(work, "nope") }));
    expect(r.data.valid).toBe(false);
    expect(r.data.errors[0].message).toContain("目录不存在");
  });

  it("目录里没有预设 → 给出提示而非静默通过", () => {
    const empty = join(work, "empty");
    mkdirSync(empty, { recursive: true });
    const r = validatePresetDir(empty);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.message.includes("没有找到任何预设"))).toBe(true);
  });
});
