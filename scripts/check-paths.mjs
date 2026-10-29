#!/usr/bin/env node
/**
 * 路径矩阵自检（V2）—— 在指定基准目录下跑四种 workspace_root / local_path 组合。
 *
 * 用法：
 *   node scripts/check-paths.mjs                  # 默认基准目录为系统临时目录
 *   node scripts/check-paths.mjs --base "D:\prd-check"
 *
 * 检查项：落盘位置正确、不产生"字面量目录"、跨盘路径可用、POSIX 风格路径被拒。
 * 退出码：0 全过，1 有失败。
 */

import { mkdtempSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const { handleWorkspaceInit, handleWorkspaceStatus } = await import(
  "file://" + join(repo, "dist", "tools", "workspace.js").replace(/\\/g, "/")
);
const { handlePublish } = await import(
  "file://" + join(repo, "dist", "tools", "publish.js").replace(/\\/g, "/")
);

const parse = (r) => JSON.parse(r.content[0].text);

const baseArgIdx = process.argv.indexOf("--base");
const base =
  baseArgIdx > -1
    ? resolve(process.argv[baseArgIdx + 1])
    : mkdtempSync(join(tmpdir(), "prd-pathcheck-"));

mkdirSync(base, { recursive: true });
console.log(`基准目录：${base}\n`);

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

/** 检查某个目录下是否意外出现了"名字像路径"的目录 */
const literalDirs = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => /^[A-Za-z]:/.test(n) || n.includes("\\") || n.includes("/"));
};

const cases = [
  { name: "普通路径", sub: "case1" },
  { name: "含空格", sub: "case 2 with space" },
  { name: "含中文", sub: "case3-需求" },
];

for (const c of cases) {
  const root = join(base, c.sub, ".prd");
  const vault = join(base, c.sub, "vault");
  const cfg = join(base, c.sub, "prd-config.yaml");
  mkdirSync(join(base, c.sub), { recursive: true });
  process.env.PRD_PIPELINE_CONFIG = cfg;

  const init = parse(handleWorkspaceInit({ local_path: vault, workspace_root: root, domain: "general" }));
  const pub = parse(handlePublish({ title: `路径-${c.sub}`, content: "# 测试\n正文\n", system: "local" }));

  const okInit = init.ok && init.data.workspace_root === root;
  const okPub = pub.ok && existsSync(pub.data.local.path);
  const strays = literalDirs(join(base, c.sub));

  record(
    c.name,
    okInit && okPub && strays.length === 0,
    okInit && okPub
      ? strays.length
        ? `出现异常目录：${strays.join(", ")}`
        : "落盘正常"
      : `init=${okInit} publish=${okPub} ${init.error?.message ?? ""}${pub.error?.message ?? ""}`
  );
}

// 跨盘：workspace_root 与 local_path 分属不同根
{
  const cfg = join(base, "cross", "prd-config.yaml");
  mkdirSync(join(base, "cross"), { recursive: true });
  process.env.PRD_PIPELINE_CONFIG = cfg;
  const otherRoot = process.platform === "win32" ? join(base, "cross") : join(base, "cross");
  const init = parse(
    handleWorkspaceInit({
      local_path: join(base, "cross", "vault-a"),
      workspace_root: join(otherRoot, ".prd"),
      domain: "general",
    })
  );
  const pub = parse(handlePublish({ title: "跨盘", content: "# x\n", system: "local" }));
  record("跨目录（模拟跨盘）", init.ok && pub.ok && existsSync(pub.data.local.path), pub.data?.local?.path ?? init.error?.message ?? "");
}

// 反例：POSIX 风格路径在 win32 必须被拒
{
  const cfg = join(base, "neg", "prd-config.yaml");
  mkdirSync(join(base, "neg"), { recursive: true });
  process.env.PRD_PIPELINE_CONFIG = cfg;
  const r = parse(handleWorkspaceInit({ workspace_root: "/d/prd", local_path: join(base, "neg", "vault") }));
  const expected = process.platform === "win32" ? !r.ok && r.error?.code === "INVALID_INPUT" : r.ok;
  record(
    process.platform === "win32" ? "POSIX 路径被拒绝" : "（非 win32，跳过反例）",
    expected,
    r.ok ? "接受了（win32 下应拒绝）" : `${r.error?.code}`
  );
}

delete process.env.PRD_PIPELINE_CONFIG;
if (baseArgIdx === -1) rmSync(base, { recursive: true, force: true });
else console.log(`\n产物保留在 ${base}，可自行检查后删除`);

const failed = results.filter((r) => !r.pass);
console.log(failed.length === 0 ? "\n路径自检 PASS" : `\n路径自检 FAIL（${failed.length} 项）`);
process.exit(failed.length === 0 ? 0 : 1);
