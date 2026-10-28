/**
 * M2 测试 —— 阶段集驱动讨论、预设校验、确定性审查
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleWorkspaceInit } from "../tools/workspace.js";
import { handlePresetValidate, handlePresetGet } from "../tools/preset.js";
import {
  handleDiscussStages,
  handleDiscussProbe,
  handleDiscussSave,
} from "../tools/discuss.js";
import { handleReviewCheck } from "../tools/review.js";

const parse = (r: any) => JSON.parse(r.content[0].text);

let work: string;
let wsRoot: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-m2-"));
  process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
  const vault = join(work, "vault");
  mkdirSync(vault, { recursive: true });
  wsRoot = join(work, ".prd");
  handleWorkspaceInit({ domain: "fintech", soul: "c-end-pm", doc_system: "local", local_path: vault, workspace_root: wsRoot });
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.PRD_PIPELINE_CONFIG;
});

describe("阶段集驱动讨论", () => {
  it("discuss.stages 返回阶段与叠加标记", () => {
    const r = parse(handleDiscussStages({}));
    expect(r.ok).toBe(true);
    const ids = r.data.stages.map((s: any) => s.id);
    expect(ids).toEqual(["problem", "solution", "tradeoff", "compliance", "scope"]);
    expect(r.data.stages.find((s: any) => s.id === "compliance").stacked).toBe(true);
  });

  it("discuss.probe(problem) 返回带选项的探针", () => {
    const r = parse(handleDiscussProbe({ stage: "problem" }));
    expect(r.ok).toBe(true);
    expect(r.data.probes.length).toBeGreaterThan(0);
    expect(r.data.probes[0].options.length).toBeGreaterThanOrEqual(2);
    expect(r.data.probes[0].stage).toBe("problem");
  });

  it("discuss.probe(compliance) 叠加合规依据源 + 领域红线", () => {
    const ids = parse(handleDiscussProbe({ stage: "compliance" })).data.probes.map((p: any) => p.id);
    expect(ids).toContain("cp1"); // C 端隐私
    expect(ids).toContain("ft1"); // fintech 红线
  });

  it("未知阶段报错并列出可用阶段", () => {
    const r = parse(handleDiscussProbe({ stage: "nope" }));
    expect(r.ok).toBe(false);
    expect(r.error.hint).toContain("problem");
  });
});

describe("结论落盘", () => {
  it("写入 discussion-<stage>.md 并推进进度", () => {
    const r = parse(handleDiscussSave({ title: "登录优化", stage: "problem", intent: "I", decisions: "D" }));
    expect(r.ok).toBe(true);
    expect(existsSync(r.data.file)).toBe(true);
    expect(readFileSync(r.data.file, "utf-8")).toContain("### Intent");
    expect(r.data.next_stage).toBe("solution");
    expect(readFileSync(join(wsRoot, "登录优化", "state.yaml"), "utf-8")).toContain("problem");
  });

  it("同一阶段二次保存为追加", () => {
    handleDiscussSave({ title: "T", stage: "problem", intent: "first" });
    const r = parse(handleDiscussSave({ title: "T", stage: "problem", intent: "second" }));
    const body = readFileSync(r.data.file, "utf-8");
    expect(body).toContain("first");
    expect(body).toContain("second");
  });
});

describe("预设校验", () => {
  it("内置模板合法", () => {
    const r = parse(handlePresetValidate({ name: "standard", type: "template" }));
    expect(r.data.valid).toBe(true);
    expect(r.data.errors).toEqual([]);
  });

  it("同名跨类型时提示指定 type", () => {
    const r = parse(handlePresetGet({ name: "standard" }));
    expect(r.ok).toBe(false);
    expect(r.error.hint).toContain("type");
  });

  it("非法预设返回具体错误", () => {
    const bad = join(work, "bad.md");
    writeFileSync(bad, "---\nname: bad\ntype: template\nplaceholders: \"oops\"\n---\n", "utf-8");
    const r = parse(handlePresetValidate({ path: bad }));
    expect(r.data.valid).toBe(false);
    expect(r.data.errors.length).toBeGreaterThan(0);
  });
});

describe("确定性审查", () => {
  it("缺量化目标与无图 → 检出", () => {
    const content = "# T\n\n## PRD 修订记录\n\n| 版本 | 时间 | 修订内容 | 修订人 |\n|---|---|---|---|\n| v1.0 | 2026-10-15 | 初版 | 我 |\n\n## 一、背景\n\n有内容\n";
    const r = parse(handleReviewCheck({ content }));
    const codes = r.data.findings.map((f: any) => f.code);
    expect(codes).toContain("METRICS_MISSING");
    expect(codes).toContain("DIAGRAM_MISSING");
    expect(r.data.passed).toBe(false);
  });

  it("残留占位符 → P0", () => {
    const r = parse(handleReviewCheck({ content: "# T\n\n{{todo}}\n\n## 修订记录\n\n|a|\n\n## S\n\n指标\n\n```mermaid\ngraph TD\n A-->B\n```\n" }));
    const f = r.data.findings.find((x: any) => x.code === "PLACEHOLDER_UNRESOLVED");
    expect(f.severity).toBe("P0");
  });

  it("完整内容 → passed", () => {
    const content = "# T\n\n## PRD 修订记录\n\n| 版本 | 时间 | 修订内容 | 修订人 |\n|---|---|---|---|\n| v1.0 | 2026-10-15 | 初版 | 我 |\n\n## 一、背景\n\n有\n\n## 二、目标\n\n| 指标 | 目标值 |\n|---|---|\n| x | 1 |\n\n## 三、详述\n\n```mermaid\ngraph TD\n A-->B\n```\n";
    const r = parse(handleReviewCheck({ content }));
    expect(r.data.findings).toEqual([]);
    expect(r.data.passed).toBe(true);
  });
});
