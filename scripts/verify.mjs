#!/usr/bin/env node
/**
 * 一条命令跑完四层验证：依赖平台、类型检查、单测、构建新鲜度（--full 再加构建+冒烟）。
 *
 * 设计要点：平台不匹配时明确报错并跳过跑不动的步骤，而不是给出一堆误导性的失败。
 * 这正是 M7 复盘里踩过的坑——在只装了 win32 原生依赖的目录里用 Linux node 跑测试，
 * 看到的是 esbuild/rolldown 的模块错误，很容易被误读成代码问题。
 *
 * 用法：
 *   node scripts/verify.mjs          # 依赖 + 类型 + 单测 + 新鲜度
 *   node scripts/verify.mjs --full   # 额外跑 build 与 smoke
 */

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");
const platform = process.platform;
const arch = process.arch;
const platformTag = `${platform}-${arch}`;

const rows = [];
const add = (step, ok, detail, skipped = false) => {
  rows.push({ step, ok, detail, skipped });
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

function installedBindings(dir, prefix) {
  const abs = join(root, "node_modules", ...dir.split("/"));
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
    .map((e) => e.name);
}

function matchesPlatform(name) {
  const tokens = ["win32", "linux", "darwin"];
  const hit = tokens.find((t) => name.includes(t));
  if (!hit) return false;
  return hit === platform && name.includes(arch);
}

/* ── 1. 环境 ───────────────────────────────────────────── */
const major = Number(process.versions.node.split(".")[0]);
const nodeOk = major >= 20;
add("env", nodeOk, `node v${process.versions.node} ${platformTag}`);

/* ── 2. 原生依赖平台 ────────────────────────────────────── */
const esbuild = installedBindings("@esbuild", "");
const rolldown = installedBindings("@rolldown", "binding-");
const nm = join(root, "node_modules");
const lightning = existsSync(nm)
  ? readdirSync(nm).filter((n) => n.startsWith("lightningcss-"))
  : [];

const allBindings = [...esbuild, ...rolldown, ...lightning];
const platformOk = allBindings.some((n) => matchesPlatform(n));

if (platformOk) {
  add("deps", true, allBindings.filter(matchesPlatform).join(", "));
} else {
  add(
    "deps",
    false,
    allBindings.length === 0
      ? "未找到任何原生绑定包，先运行 npm ci"
      : `${platformTag} 下没有可用绑定；已安装：${allBindings.join(", ")}（换平台后需重新 npm ci）`
  );
}

/* ── 3. 类型检查（跨平台可跑） ───────────────────────────── */
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const tscSrc = run(process.execPath, [tsc, "-p", "tsconfig.json", "--noEmit"]);
add("typecheck src", tscSrc.status === 0, tscSrc.status === 0 ? "0 errors" : (tscSrc.stdout || tscSrc.stderr || "").trim().split("\n")[0]);

const testsDir = join(root, "src", "__tests__");
const testFiles = existsSync(testsDir)
  ? readdirSync(testsDir).filter((n) => n.endsWith(".ts")).map((n) => `src/__tests__/${n}`)
  : [];
const tscTests = run(process.execPath, [
  tsc, "--noEmit", "--strict",
  "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "bundler",
  "--skipLibCheck", "--types", "node",
  "src/paths.ts", "src/freshness.ts",
  ...testFiles,
]);
add("typecheck tests", tscTests.status === 0, tscTests.status === 0 ? "0 errors" : (tscTests.stdout || tscTests.stderr || "").trim().split("\n")[0]);

/* ── 4. 单测（需平台匹配） ──────────────────────────────── */
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
if (!platformOk) {
  add("tests", false, "跳过：原生依赖平台不匹配", true);
} else {
  const vitest = join(root, "node_modules", "vitest", "vitest.mjs");
  const r = run(process.execPath, [vitest, "run", "--reporter=dot", "--no-color"], {
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const out = stripAnsi(`${r.stdout || ""}${r.stderr || ""}`);
  const m = out.match(/Tests\s+(\d+) passed/);
  const failed = out.match(/(\d+) failed/);
  const detail =
    r.status === 0
      ? m
        ? `${m[1]} passed`
        : "passed（未能解析条数）"
      : `${failed ? failed[1] : "?"} failed`;
  add("tests", r.status === 0, detail);
  if (r.status !== 0) {
    const tail = out
      .trim()
      .split("\n")
      .filter((l) => l.includes("FAIL") || l.includes("×"))
      .slice(0, 5);
    if (tail.length) add("tests 详情", false, tail.join(" | "));
  }
}

/* ── 5. 构建新鲜度 ──────────────────────────────────────── */
function newestTs(dir) {
  if (!existsSync(dir)) return null;
  let best = null;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(p);
      } else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
        const m = statSync(p).mtimeMs;
        if (best === null || m > best.mtimeMs) best = { file: p, mtimeMs: m };
      }
    }
  };
  walk(dir);
  return best;
}

const distEntry = join(root, "dist", "index.js");
const newest = newestTs(join(root, "src"));
if (!existsSync(distEntry)) {
  add("freshness", false, "dist/index.js 不存在，先 npm run build");
} else if (newest === null) {
  add("freshness", true, "无 src 目录，跳过");
} else {
  const stale = newest.mtimeMs > statSync(distEntry).mtimeMs + 1000;
  add(
    "freshness",
    !stale,
    stale ? `dist 落后于 ${relative(root, newest.file)}，先 npm run build` : "dist 不早于 src"
  );
}

/* ── 6. 构建 + 冒烟（--full） ───────────────────────────── */
if (full) {
  const build = run(process.execPath, [tsc, "-p", "tsconfig.json"]);
  add("build", build.status === 0, build.status === 0 ? "tsc ok" : (build.stdout || build.stderr || "").trim().split("\n")[0]);

  if (!platformOk) {
    add("smoke", false, "跳过：原生依赖平台不匹配", true);
  } else if (build.status === 0) {
    const smoke = run(process.execPath, [join(root, "scripts", "smoke.mjs")]);
    const out = `${smoke.stdout || ""}${smoke.stderr || ""}`;
    add("smoke", smoke.status === 0 && out.includes("SMOKE PASS"), smoke.status === 0 ? "SMOKE PASS" : "见上方输出");
    if (smoke.status !== 0) console.error(out.trim().split("\n").slice(-15).join("\n"));
  }
}

/* ── 输出 ──────────────────────────────────────────────── */
console.log("\nprd-pipeline verify\n");
for (const r of rows) {
  const mark = r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL";
  console.log(`  ${r.step.padEnd(16)} ${mark}  ${r.detail}`);
}

const failed = rows.filter((r) => !r.ok && !r.skipped);
const skipped = rows.filter((r) => r.skipped);
console.log("");
if (failed.length === 0 && skipped.length === 0) {
  console.log("OK");
  process.exit(0);
}
if (failed.length === 0) {
  console.log(`OK（${skipped.length} 项跳过）`);
  process.exit(0);
}
console.log(`FAILED：${failed.map((f) => f.step).join(", ")}`);
process.exit(platformOk ? 1 : 2);
