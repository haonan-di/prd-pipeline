#!/usr/bin/env node
/**
 * 自定义预设自检（V3）—— 在指定基准目录下建一个中文名自定义预设目录，
 * 用内置 _template.md 生成六类预设，验证：发现、来源标注、批量校验、放错目录被拦。
 *
 * 用法：
 *   node scripts/check-presets.mjs                 # 默认临时目录
 *   node scripts/check-presets.mjs --base "D:\prd-check"
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const toUrl = (p) => "file://" + p.replace(/\\/g, "/");
const { handleWorkspaceInit } = await import(toUrl(join(repo, "dist", "tools", "workspace.js")));
const { handlePresetList, handlePresetValidate } = await import(toUrl(join(repo, "dist", "tools", "preset.js")));

const parse = (r) => JSON.parse(r.content[0].text);
const baseIdx = process.argv.indexOf("--base");
const base = baseIdx > -1 ? resolve(process.argv[baseIdx + 1]) : mkdtempSync(join(tmpdir(), "prd-presetcheck-"));
mkdirSync(base, { recursive: true });

const custom = join(base, "我的预设"); // 故意用中文目录名
const cfg = join(base, "prd-config.yaml");
process.env.PRD_PIPELINE_CONFIG = cfg;

console.log(`基准目录：${base}`);
console.log(`自定义预设目录：${custom}\n`);

const TYPE_DIRS = {
  domain: "domains",
  soul: "souls",
  template: "templates",
  compliance: "compliance",
  stages: "stages",
  diagrams: "diagrams",
};

// 1) 用内置 _template.md 生成六类自定义预设
for (const [type, sub] of Object.entries(TYPE_DIRS)) {
  const src = join(repo, "presets", sub, "_template.md");
  const dstDir = join(custom, sub);
  mkdirSync(dstDir, { recursive: true });
  const raw = readFileSync(src, "utf-8").replace(/^name:\s*.*$/m, `name: my-${type}`);
  writeFileSync(join(dstDir, `my-${type}.md`), raw, "utf-8");
}

const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

// 2) 初始化并指向该目录
const init = parse(
  handleWorkspaceInit({
    local_path: join(base, "vault"),
    workspace_root: join(base, ".prd"),
    preset_dirs: [custom],
  })
);
record("init 接受中文路径 preset_dirs", init.ok === true, init.error?.message ?? "");

// 3) 六个自定义预设都应被发现且来源为 custom
const list = parse(handlePresetList({}));
const mine = list.data.presets.filter((p) => p.name.startsWith("my-"));
record("六个自定义预设全部可见", mine.length === 6, `实际 ${mine.length} 个`);
record("来源标注为 custom", mine.every((p) => p.source === "custom"));

// 4) 批量校验应为全绿
const batch = parse(handlePresetValidate({ dir: custom }));
record("批量校验通过", batch.data.valid === true && batch.data.scanned === 6, `scanned=${batch.data.scanned}, errors=${batch.data.errors.length}`);

// 5) 反例：把 soul 放进 domains
const wrongPath = join(custom, "domains", "wrong-soul.md");
writeFileSync(wrongPath, "---\nname: wrong-soul\ntype: soul\nversion: 1\n---\n正文\n", "utf-8");
const wrong = parse(handlePresetValidate({ path: wrongPath }));
record(
  "放错目录被拦截",
  wrong.data.valid === false && wrong.data.errors.some((e) => e.message.includes("应放到 souls/")),
  wrong.data.errors?.[0]?.message ?? ""
);

delete process.env.PRD_PIPELINE_CONFIG;
if (baseIdx === -1) rmSync(base, { recursive: true, force: true });
else console.log(`\n产物保留在 ${base}，可自行检查后删除`);

const failed = results.filter((r) => !r.pass);
console.log(failed.length === 0 ? "\n预设自检 PASS" : `\n预设自检 FAIL（${failed.length} 项）`);
process.exit(failed.length === 0 ? 0 : 1);
