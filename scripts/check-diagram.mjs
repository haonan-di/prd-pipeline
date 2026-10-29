#!/usr/bin/env node
/**
 * 图表本地出图自检（M5）—— 用本机浏览器真实渲染一次 mermaid，并生成一份 .drawio。
 *
 * 用法：
 *   node scripts/check-diagram.mjs
 *   node scripts/check-diagram.mjs --base "D:\prd-check"
 *
 * 说明：这是唯一需要真实浏览器的一步；CI/沙箱里没有浏览器时会明确 SKIP 而不是失败。
 */

import { mkdtempSync, mkdirSync, readFileSync, existsSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const toUrl = (p) => "file://" + p.replace(/\\/g, "/");
const { handleWorkspaceInit } = await import(toUrl(join(repo, "dist", "tools", "workspace.js")));
const { handleDiagramBuild } = await import(toUrl(join(repo, "dist", "tools", "diagram.js")));
const { findBrowser } = await import(toUrl(join(repo, "dist", "diagram", "browser.js")));

const parse = (r) => JSON.parse(r.content[0].text);
const baseIdx = process.argv.indexOf("--base");
const base = baseIdx > -1 ? resolve(process.argv[baseIdx + 1]) : mkdtempSync(join(tmpdir(), "prd-diagcheck-"));
mkdirSync(base, { recursive: true });
process.env.PRD_PIPELINE_CONFIG = join(base, "prd-config.yaml");

const results = [];
const record = (name, pass, detail = "", skip = false) => {
  results.push({ name, pass, skip });
  console.log(`  ${skip ? "SKIP" : pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

console.log(`基准目录：${base}`);
const browser = findBrowser();
console.log(`探测到的浏览器：${browser ? `${browser.kind} → ${browser.path}` : "无"}\n`);

handleWorkspaceInit({ local_path: join(base, "vault"), workspace_root: join(base, ".prd") });
const outDir = join(base, "assets");

// 1) mermaid 本地渲染
const code = `flowchart TD
  A[提交申请] --> B{风控校验}
  B -->|通过| C[放款]
  B -->|拒绝| D[提示原因]`;
const mermaid = parse(await handleDiagramBuild({ code, strategy: "local", out_dir: outDir, format: "svg" }));

if (!browser) {
  record("mermaid 本地渲染", false, "无可用浏览器", true);
} else if (mermaid.data?.strategy_used === "local") {
  const p = mermaid.data.local_path;
  const size = p && existsSync(p) ? statSync(p).size : 0;
  const head = p && existsSync(p) ? readFileSync(p, "utf-8").slice(0, 5) : "";
  record("mermaid 本地渲染", head === "<svg " && size > 500, `${size} 字节 → ${p}`);
  if (mermaid.data.warnings.length) console.log(`        告警：${mermaid.data.warnings.join(" / ")}`);
} else {
  record("mermaid 本地渲染", false, `降级为 ${mermaid.data?.strategy_used}：${(mermaid.data?.warnings ?? []).join(" / ")}`);
}

// 2) drawio 文件生成
const drawioXml = `<mxfile><diagram id="d1" name="流程"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
const drawio = parse(await handleDiagramBuild({ engine: "drawio", code: drawioXml, strategy: "local", out_dir: outDir }));
record(
  "drawio 生成 .drawio 文件",
  drawio.ok && drawio.data.local_path?.endsWith(".drawio") && existsSync(drawio.data.local_path),
  drawio.data?.local_path ?? drawio.error?.message ?? ""
);

// 3) 非法源码要被拒
const bad = parse(await handleDiagramBuild({ engine: "drawio", code: "not xml", strategy: "source" }));
record("drawio 拒绝非 XML 源码", bad.ok === false && bad.error.code === "DIAGRAM_INVALID");

// 4) 产物目录
record("产物落在指定 out_dir", existsSync(outDir), outDir);

delete process.env.PRD_PIPELINE_CONFIG;
const failed = results.filter((r) => !r.pass && !r.skip);
console.log(
  failed.length === 0
    ? `\n图表自检 PASS${results.some((r) => r.skip) ? "（含 SKIP）" : ""}`
    : `\n图表自检 FAIL（${failed.length} 项）`
);
if (baseIdx === -1 && failed.length === 0) rmSync(base, { recursive: true, force: true });
else console.log(`产物保留在 ${base}，可自行打开检查`);
process.exit(failed.length === 0 ? 0 : 1);
