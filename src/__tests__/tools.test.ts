/**
 * M1 集成测试 —— 直调工具处理器，覆盖 init / preset / generate / diagram / publish
 * 对应 CONTRACTS.md §9 的 L3 层（无外部依赖）。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { handleWorkspaceInit, handleWorkspaceStatus } from "../tools/workspace.js";
import { handlePresetList, handlePresetGet } from "../tools/preset.js";
import { handleGenerate } from "../tools/generate.js";
import { handleDiagramBuild } from "../tools/diagram.js";
import { handlePublish } from "../tools/publish.js";

const parse = (r: any) => JSON.parse(r.content[0].text);
const residue = (s: string) => /\{\{[^{}]+\}\}/.test(s);
const sections = { background: "背景", objectives: "目标", details: "详述", compliance: "合规" };

let work: string;
let vault: string;
let wsRoot: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-test-"));
  process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
  vault = join(work, "vault");
  mkdirSync(vault, { recursive: true });
  wsRoot = join(work, ".prd");
  handleWorkspaceInit({
    domain: "fintech",
    soul: "c-end-pm",
    doc_system: "local",
    local_path: vault,
    workspace_root: wsRoot,
  });
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.PRD_PIPELINE_CONFIG;
});

describe("预设扫描（取代硬编码）", () => {
  it("列出内置预设并跳过 _ 前缀文件", () => {
    const keys = parse(handlePresetList({})).data.presets.map((p: any) => `${p.type}/${p.name}`);
    for (const k of ["domain/fintech", "soul/c-end-pm", "template/standard", "stages/standard"]) {
      expect(keys).toContain(k);
    }
    expect(keys.some((k: string) => k.includes("_example"))).toBe(false);
  });

  it("init 返回扫描出的可用预设，无幻影项", () => {
    const r = parse(handleWorkspaceInit({ domain: "fintech" }));
    expect(r.data.available.domains).toContain("fintech");
    expect(r.data.available.domains).not.toContain("ecommerce");
  });

  it("preset.get 返回 frontmatter 与正文", () => {
    const r = parse(handlePresetGet({ name: "fintech" }));
    expect(r.ok).toBe(true);
    expect(r.data.type).toBe("domain");
    expect(r.data.frontmatter.name).toBe("fintech");
  });
});

describe("工作区状态", () => {
  it("init 后为 ready", () => {
    expect(parse(handleWorkspaceStatus()).data.status).toBe("ready");
  });
});

describe("generate（模板契约对齐）", () => {
  it("缺必填章节 → PLACEHOLDER_MISSING", () => {
    const r = parse(handleGenerate({ title: "T", sections: { background: "B" } }));
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("PLACEHOLDER_MISSING");
  });

  it("成功渲染：无残留占位符并落盘", () => {
    const r = parse(handleGenerate({ title: "登录风险提示", sections }));
    expect(r.ok).toBe(true);
    expect(residue(r.data.content)).toBe(false);
    expect(existsSync(r.data.file)).toBe(true);
    expect(readFileSync(r.data.file, "utf-8")).toContain("登录风险提示");
  });

  it("嵌入图后仍无残留", () => {
    const r = parse(
      handleGenerate({
        title: "带图需求",
        sections,
        diagrams: [{ placement: "details", source: "graph TD\n  A-->B", caption: "流程" }],
      })
    );
    expect(r.ok).toBe(true);
    expect(r.data.content).toContain("```mermaid");
    expect(residue(r.data.content)).toBe(false);
  });
});

describe("diagram.build（策略与编码）", () => {
  it("默认策略 source，零外发", async () => {
    const r = parse(await handleDiagramBuild({ code: "graph TD\n  A-->B" }));
    expect(r.ok).toBe(true);
    expect(r.data.strategy_used).toBe("source");
    expect(r.data.image_url).toBeUndefined();
  });

  it("remote 未确认 → RENDER_REMOTE_DENIED", async () => {
    const r = parse(await handleDiagramBuild({ code: "graph TD\n A-->B", strategy: "remote" }));
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("RENDER_REMOTE_DENIED");
  });

  it("remote + 确认 → ink URL 可还原为 JSON（修正缺陷）", async () => {
    const r = parse(
      await handleDiagramBuild({ code: "graph TD\n  A-->B", strategy: "remote", confirm_remote: true })
    );
    const url: string = r.data.image_url;
    expect(url.startsWith("https://mermaid.ink/svg/")).toBe(true);
    const b64 = url.split("/svg/")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(inflateSync(Buffer.from(b64, "base64")).toString("utf-8"));
    expect(payload.code).toBe("graph TD\n  A-->B");
  });

  it("非法源码 → DIAGRAM_INVALID", async () => {
    const r = parse(await handleDiagramBuild({ code: "这不是图" }));
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("DIAGRAM_INVALID");
  });
});

describe("修订记录累积", () => {
  it("多次生成时保留历史版本", () => {
    const r1 = parse(handleGenerate({ title: "迭代需求", version: "1.0", changelog: "初版", sections }));
    expect(r1.ok).toBe(true);
    const r2 = parse(handleGenerate({ title: "迭代需求", version: "1.1", changelog: "补充灰度", sections }));
    expect(r2.ok).toBe(true);
    expect(r2.data.content).toContain("v1.0");
    expect(r2.data.content).toContain("v1.1");
    expect(r2.data.content).toContain("补充灰度");
  });

  it("重复生成同一版本不重复累加", () => {
    handleGenerate({ title: "同版需求", version: "1.0", changelog: "初版", sections });
    const r = parse(handleGenerate({ title: "同版需求", version: "1.0", changelog: "改写", sections }));
    const rows = (r.data.content.match(/\| v1\.0 \|/g) ?? []).length;
    expect(rows).toBe(1);
    expect(r.data.content).toContain("改写");
  });
});

describe("publish", () => {
  it("local_first 写入 vault/PRD", () => {
    const g = parse(handleGenerate({ title: "交付需求", sections }));
    const r = parse(handlePublish({ title: "交付需求", content: g.data.content }));
    expect(r.ok).toBe(true);
    expect(r.data.local.path).toContain(join("vault", "PRD"));
    expect(existsSync(r.data.local.path)).toBe(true);
  });

  it("在线系统 → 返回交接指引", () => {
    const r = parse(handlePublish({ title: "X", content: "body", system: "confluence" }));
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.data.remote_handoff.instructions)).toBe(true);
  });
});
