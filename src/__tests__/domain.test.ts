/**
 * 领域识别测试（契约 v3）
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectDomain } from "../presets/domain-detect.js";
import { handleWorkspaceInit } from "../tools/workspace.js";
import { handleDomainDetect } from "../tools/domain.js";

const parse = (r: any) => JSON.parse(r.content[0].text);

const FINTECH = {
  name: "fintech",
  keywords: ["借款", "还款", "征信", "分期", "回端", "单字", "额"],
};
const GENERAL = { name: "general", keywords: [] as string[] };

describe("detectDomain 纯函数", () => {
  it("命中多个关键词 → 建议切换", () => {
    const r = detectDomain("好分期小程序引导回端，涉及借款与征信", [FINTECH, GENERAL], "general");
    expect(r.recommendation?.switch_to).toBe("fintech");
    expect(r.recommendation?.matched).toEqual(expect.arrayContaining(["分期", "回端", "借款"]));
  });

  it("与当前领域一致时不建议切换", () => {
    const r = detectDomain("借款还款征信", [FINTECH, GENERAL], "fintech");
    expect(r.recommendation).toBeNull();
  });

  it("只命中 1 个关键词（默认 minHits=2）不建议切换", () => {
    const r = detectDomain("这次做借款相关的东西", [FINTECH, GENERAL], "general");
    expect(r.recommendation).toBeNull();
  });

  it("单字关键词不参与匹配（避免噪声）", () => {
    // 只有单字能命中时，不产生任何建议（而不是产生一条 matched 为空的建议）
    const onlySingle = { name: "x", keywords: ["额", "单字"] };
    const r = detectDomain("额度", [onlySingle], "general");
    expect(r.suggestions).toEqual([]);

    // 单字与多字并存时，matched 只记多字
    const mixed = { name: "x", keywords: ["额", "额度"] };
    const r2 = detectDomain("额度", [mixed], "general");
    expect(r2.suggestions[0]?.matched).toEqual(["额度"]);
  });

  it("无关文本不产生建议", () => {
    const r = detectDomain("优化登录页的按钮颜色", [FINTECH, GENERAL], "general");
    expect(r.suggestions).toEqual([]);
    expect(r.recommendation).toBeNull();
  });
});

describe("prd/domain.detect 工具", () => {
  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), "prd-domain-"));
    process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
    const vault = join(work, "vault");
    mkdirSync(vault, { recursive: true });
    handleWorkspaceInit({ doc_system: "local", local_path: vault, workspace_root: join(work, ".prd") });
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
    delete process.env.PRD_PIPELINE_CONFIG;
  });

  it("默认 general 时，金融需求会建议切到 fintech", () => {
    const r = parse(handleDomainDetect({ text: "好分期 小程序引导回端 app" }));
    expect(r.ok).toBe(true);
    expect(r.data.current).toBe("general");
    expect(r.data.recommendation.switch_to).toBe("fintech");
  });

  it("无关需求不建议切换", () => {
    const r = parse(handleDomainDetect({ text: "把设置页的字体调大一点" }));
    expect(r.data.recommendation).toBeNull();
  });

  it("缺少 text 报 INVALID_INPUT", () => {
    const r = parse(handleDomainDetect({ text: "  " }));
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("INVALID_INPUT");
  });
});
