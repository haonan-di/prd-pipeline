#!/usr/bin/env node
/**
 * L3 冒烟：真实 stdio MCP 全链路
 * init → preset.list/validate → discuss.stages/probe/save → generate → diagram.build → review.check → publish
 * 用法：npm run smoke（会先 build）
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

const work = mkdtempSync(join(tmpdir(), "prd-smoke-"));
const vault = join(work, "vault");
mkdirSync(vault, { recursive: true });
const cfg = join(work, "prd-config.yaml");

const transport = new StdioClientTransport({
  command: "node",
  args: [serverPath],
  env: { ...process.env, PRD_PIPELINE_CONFIG: cfg },
});
const client = new Client({ name: "prd-smoke", version: "1.0.0" });

const residue = (s) => /\{\{[^{}]+\}\}/.test(s);

try {
  await client.connect(transport);

  const call = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return JSON.parse(res.content[0].text);
  };

  const tools = await client.listTools();
  assert(tools.tools.length >= 14, "工具应至少 14 个");
  console.log("  ok - tools/list:", tools.tools.length, "个工具");

  const inv = await call("prd/workspace.init", {
    domain: "fintech",
    soul: "c-end-pm",
    doc_system: "local",
    local_path: vault,
    workspace_root: join(work, ".prd"),
  });
  assert.equal(inv.ok, true);
  assert(inv.data.available.domains.includes("fintech"));
  console.log("  ok - workspace.init");

  assert.equal((await call("prd/workspace.status")).data.status, "ready");
  console.log("  ok - workspace.status = ready");

  const noDomain = await call("prd/workspace.init", { domain: "" });
  assert.equal(noDomain.data.config.workspace.domain, "general", "清空领域应归一为 general");
  assert.equal(noDomain.data.status, "ready", "归一到 general 后仍应 ready");

  const detect = await call("prd/domain.detect", { text: "好分期小程序引导回端，涉及借款还款与征信" });
  assert.equal(detect.data.recommendation.switch_to, "fintech", "应建议切到 fintech");
  assert(detect.data.recommendation.matched.length >= 2, "建议应带命中证据");

  await call("prd/workspace.init", { domain: "fintech" });
  console.log("  ok - 领域默认 general + domain.detect 带证据建议");

  const presets = await call("prd/preset.list", {});
  assert(presets.data.presets.some((p) => p.type === "template" && p.name === "standard"));
  assert(presets.data.presets.some((p) => p.type === "domain" && p.name === "general"));
  assert(presets.data.presets.some((p) => p.type === "compliance" && p.name === "c-end-privacy"));
  console.log("  ok - preset.list（含合规依据源）");

  assert.equal((await call("prd/preset.validate", { name: "standard", type: "template" })).data.valid, true);
  const ambiguous = await call("prd/preset.get", { name: "standard" });
  assert.equal(ambiguous.ok, false, "同名跨类型应提示指定 type");
  console.log("  ok - preset.validate + 同名歧义处理");

  const stages = await call("prd/discuss.stages", {});
  assert(stages.data.stages.map((s) => s.id).join(",").includes("compliance"));
  console.log("  ok - discuss.stages");

  const problem = await call("prd/discuss.probe", { stage: "problem" });
  assert(problem.data.probes.length > 0 && problem.data.probes[0].options.length >= 2);
  console.log("  ok - discuss.probe(problem)，含选项");

  const comp = await call("prd/discuss.probe", { stage: "compliance" });
  const ids = comp.data.probes.map((p) => p.id);
  assert(ids.includes("cp1"), "应叠加 C 端隐私依据源");
  assert(ids.includes("ft1"), "应叠加 fintech 领域红线");
  console.log("  ok - discuss.probe(compliance) 叠加载入");

  const saved = await call("prd/discuss.save", {
    title: "冒烟需求",
    stage: "problem",
    intent: "验证落盘",
    decisions: "无",
  });
  assert(existsSync(saved.data.file));
  assert.equal(saved.data.next_stage, "solution");
  console.log("  ok - discuss.save（落盘 + 进度更新）");

  const gen = await call("prd/generate", {
    title: "冒烟需求",
    sections: { background: "B", objectives: "O", details: "D", compliance: "C" },
    diagrams: [{ placement: "details", source: "graph TD\n  A-->B", caption: "流程" }],
  });
  assert.equal(gen.ok, true);
  assert(!residue(gen.data.content), "产物不应残留占位符");
  console.log("  ok - generate（无残留占位符）");

  const gen2 = await call("prd/generate", {
    title: "冒烟需求",
    version: "1.1",
    changelog: "二次修订",
    sections: { background: "B", objectives: "O", details: "D", compliance: "C" },
  });
  assert(gen2.data.content.includes("v1.0") && gen2.data.content.includes("v1.1"), "修订记录应累积历史版本");
  console.log("  ok - generate 修订记录累积历史版本");

  const review = await call("prd/review.check", { content: gen.data.content });
  assert(review.data.findings.some((f) => f.code === "METRICS_MISSING"), "应检出缺量化目标");
  console.log("  ok - review.check（确定性检查）");

  const diagSource = await call("prd/diagram.build", { code: "graph TD\n  A-->B" });
  assert.equal(diagSource.data.strategy_used, "source");
  console.log("  ok - diagram.build（source，零外发）");

  const diagRemote = await call("prd/diagram.build", {
    code: "graph TD\n  A-->B",
    strategy: "remote",
    confirm_remote: true,
  });
  assert(diagRemote.ok && diagRemote.data.image_url.startsWith("https://mermaid.ink/"));
  console.log("  ok - diagram.build（remote + 确认）");

  const pub = await call("prd/publish", { title: "冒烟需求", content: gen.data.content });
  assert(pub.ok && existsSync(pub.data.local.path));
  console.log("  ok - publish →", pub.data.local.path);

  console.log("\nSMOKE PASS");
} finally {
  await client.close();
}
