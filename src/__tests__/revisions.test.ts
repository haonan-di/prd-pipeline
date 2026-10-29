/**
 * C1 / C3 回归 —— 交付语义与审查阻断规则
 *
 * C1：同版本视为同一修订，覆盖原文件，不再产生 `-2` 副本；
 *     内容变化但版本号没递增时要提醒。
 * C3：审查只有 P0 阻断，P1/P2 作为建议——纯文字需求不该被"必须有图"卡住。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleGenerate } from "../tools/generate.js";
import { handlePublish } from "../tools/publish.js";
import { handleReviewCheck } from "../tools/review.js";
import { handleWorkspaceInit } from "../tools/workspace.js";

const parse = (r: any) => JSON.parse(r.content[0].text);

let work: string;
let vault: string;
let root: string;

const sections = (over: Record<string, string> = {}) => ({
  background: "背景。",
  objectives: "| 指标 | 目标值 |\n|---|---|\n| x | 1 |",
  details: "详述。",
  compliance: "合规。",
  ...over,
});

const gen = (version: string, over: Record<string, string> = {}) =>
  parse(
    handleGenerate({
      title: "版本语义",
      slug: "ver",
      workspace_root: root,
      version,
      changelog: `v${version}`,
      author: "T",
      sections: sections(over),
    })
  );

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-rev-"));
  process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
  vault = join(work, "vault");
  root = join(work, ".prd");
  mkdirSync(vault, { recursive: true });
  handleWorkspaceInit({ local_path: vault, workspace_root: root, doc_system: "local" });
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.PRD_PIPELINE_CONFIG;
});

describe("C1 generate：同版本覆盖", () => {
  it("同版本生成两次 → 同一文件，第二次标记 overwritten", () => {
    const a = gen("1.0");
    const b = gen("1.0");
    expect(a.data.overwritten).toBe(false);
    expect(b.data.overwritten).toBe(true);
    expect(b.data.file).toBe(a.data.file);

    const files = readdirSync(join(root, "ver")).filter((f) => f.startsWith("prd-"));
    expect(files).toEqual(["prd-v1.0.md"]);
  });

  it("同版本内容有变化 → 覆盖并提示版本号未递增", () => {
    gen("1.0");
    const b = gen("1.0", { details: "详述（改过）。" });
    expect(b.data.overwritten).toBe(true);
    expect(b.data.warnings.join("\n")).toContain("版本号未递增");
  });

  it("同版本内容一致 → 不误报版本号问题", () => {
    gen("1.0");
    const b = gen("1.0");
    expect(b.data.warnings.join("\n")).not.toContain("版本号未递增");
  });

  it("不同版本 → 各自独立文件", () => {
    gen("1.0");
    gen("1.1");
    const files = readdirSync(join(root, "ver")).filter((f) => f.startsWith("prd-")).sort();
    expect(files).toEqual(["prd-v1.0.md", "prd-v1.1.md"]);
  });
});

describe("C1 publish：同标题同版本覆盖", () => {
  const pub = (version: string) =>
    parse(handlePublish({ title: "交付语义", content: `# 交付 ${version}\n正文\n`, version }));

  it("同版本发布两次 → 同一路径，不产生 -2", () => {
    const a = pub("1.0");
    const b = pub("1.0");
    expect(b.data.local.overwritten).toBe(true);
    expect(b.data.local.path).toBe(a.data.local.path);
    const files = readdirSync(join(vault, "PRD"));
    expect(files).toHaveLength(1);
  });

  it("不同版本 → 两个文件", () => {
    pub("1.0");
    pub("1.1");
    const files = readdirSync(join(vault, "PRD"));
    expect(files).toHaveLength(2);
  });

  it("不同标题互不影响", () => {
    pub("1.0");
    parse(handlePublish({ title: "另一份", content: "# x\n", version: "1.0" }));
    expect(readdirSync(join(vault, "PRD"))).toHaveLength(2);
  });
});

describe("C3 审查：只有 P0 阻断", () => {
  const full = `# T

## PRD 修订记录

| 版本 | 时间 | 修订内容 | 修订人 |
|---|---|---|---|
| v1.0 | 2026-10-29 | 初版 | T |

## 一、背景

有内容

## 二、目标

| 指标 | 目标值 |
|---|---|
| x | 1 |

## 三、详述

\`\`\`mermaid
graph TD
  A-->B
\`\`\`
`;

  it("完整内容 → passed，各项计数为 0", () => {
    const r = parse(handleReviewCheck({ content: full }));
    expect(r.data.findings).toEqual([]);
    expect(r.data.passed).toBe(true);
    expect(r.data.counts).toEqual({ P0: 0, P1: 0, P2: 0 });
  });

  it("只有 P1/P2 → 不阻断", () => {
    const partial = full.replace(/\| 指标 \| 目标值 \|[\s\S]*?\| x \| 1 \|/, "").replace(/```mermaid[\s\S]*?```/, "");
    const r = parse(handleReviewCheck({ content: partial }));
    const codes = r.data.findings.map((f: any) => f.code);
    expect(codes).toContain("METRICS_MISSING");
    expect(codes).toContain("DIAGRAM_MISSING");
    expect(r.data.counts.P0).toBe(0);
    expect(r.data.passed).toBe(true);
  });

  it("出现 P0（残留占位符）→ 阻断", () => {
    const r = parse(handleReviewCheck({ content: full + "\n{{todo}}\n" }));
    expect(r.data.counts.P0).toBeGreaterThan(0);
    expect(r.data.passed).toBe(false);
  });
});
