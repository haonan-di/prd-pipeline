/**
 * 构建新鲜度 —— 回归自 M7 复盘：
 * dogfood 时 dist 落后于 src，server 表面正常但跑的是旧代码，
 * 导致把旧构建的行为误判成源码缺陷。这里锁定比对规则。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkBuildFreshness, newestSourceFile, freshnessWarning } from "../freshness.js";

let work: string;
let distFile: string;
let srcDir: string;

/** 把文件 mtime 设为指定秒数（相对当前时间往前推） */
function setAgeSeconds(path: string, ageSeconds: number): void {
  const t = (Date.now() - ageSeconds * 1000) / 1000;
  utimesSync(path, t, t);
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-fresh-"));
  distFile = join(work, "dist", "index.js");
  srcDir = join(work, "src");
  mkdirSync(join(work, "dist"), { recursive: true });
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(distFile, "// built\n", "utf-8");
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("newestSourceFile", () => {
  it("取最新的 .ts，忽略 .d.ts 与 node_modules", () => {
    const a = join(srcDir, "a.ts");
    const b = join(srcDir, "b.ts");
    const declOnly = join(srcDir, "types.d.ts");
    writeFileSync(a, "a", "utf-8");
    writeFileSync(b, "b", "utf-8");
    writeFileSync(declOnly, "d", "utf-8");

    const nested = join(srcDir, "node_modules", "x");
    mkdirSync(nested, { recursive: true });
    const ignored = join(nested, "newer.ts");
    writeFileSync(ignored, "x", "utf-8");

    setAgeSeconds(a, 100);
    setAgeSeconds(b, 10);
    setAgeSeconds(declOnly, 0);
    setAgeSeconds(ignored, 0);

    const newest = newestSourceFile(srcDir);
    expect(newest?.file).toBe(b);
  });

  it("递归子目录", () => {
    const deep = join(srcDir, "tools");
    mkdirSync(deep, { recursive: true });
    const f = join(deep, "deep.ts");
    writeFileSync(f, "x", "utf-8");
    expect(newestSourceFile(srcDir)?.file).toBe(f);
  });

  it("忽略 __tests__ 目录（不参与构建，改了也不该判 dist 过期）", () => {
    const tests = join(srcDir, "__tests__");
    mkdirSync(tests, { recursive: true });
    const testFile = join(tests, "a.test.ts");
    writeFileSync(testFile, "x", "utf-8");
    const mainFile = join(srcDir, "main.ts");
    writeFileSync(mainFile, "x", "utf-8");

    setAgeSeconds(mainFile, 100);
    setAgeSeconds(testFile, 0); // 最新的是测试文件

    expect(newestSourceFile(srcDir)?.file).toBe(mainFile);
  });

  it("目录不存在时返回 null", () => {
    expect(newestSourceFile(join(work, "nope"))).toBeNull();
  });
});

describe("checkBuildFreshness", () => {
  it("源码比构建新 → stale，并指出最新文件", () => {
    const f = join(srcDir, "newer.ts");
    writeFileSync(f, "x", "utf-8");
    setAgeSeconds(distFile, 60);
    const r = checkBuildFreshness(distFile, srcDir);
    expect(r.stale).toBe(true);
    expect(r.newestSource?.file).toBe(f);
    expect(r.reason).toContain("dist 比 src 旧");
  });

  it("构建比源码新 → 不 stale", () => {
    const f = join(srcDir, "old.ts");
    writeFileSync(f, "x", "utf-8");
    setAgeSeconds(f, 60);
    const r = checkBuildFreshness(distFile, srcDir);
    expect(r.stale).toBe(false);
    expect(r.reason).toBeUndefined();
  });

  it("容差范围内的差异不算 stale", () => {
    const f = join(srcDir, "same.ts");
    writeFileSync(f, "x", "utf-8");
    const now = Date.now() / 1000;
    utimesSync(distFile, now, now);
    utimesSync(f, now, now);
    expect(checkBuildFreshness(distFile, srcDir).stale).toBe(false);
  });

  it("构建产物缺失 → stale，且提示先 build", () => {
    rmSync(distFile);
    expect(existsSync(distFile)).toBe(false);
    const r = checkBuildFreshness(distFile, srcDir);
    expect(r.stale).toBe(true);
    expect(r.reason).toContain("npm run build");
  });

  it("没有 src 目录（发布包）→ 不 stale", () => {
    rmSync(srcDir, { recursive: true, force: true });
    expect(checkBuildFreshness(distFile, srcDir).stale).toBe(false);
  });
});

describe("freshnessWarning", () => {
  it("fresh 时返回 null", () => {
    const f = join(srcDir, "old.ts");
    writeFileSync(f, "x", "utf-8");
    setAgeSeconds(f, 120);
    expect(freshnessWarning(distFile, srcDir)).toBeNull();
  });

  it("stale 时给出可执行的提示", () => {
    const f = join(srcDir, "new.ts");
    writeFileSync(f, "x", "utf-8");
    setAgeSeconds(distFile, 120);
    const w = freshnessWarning(distFile, srcDir);
    expect(w).toContain("npm run build");
    expect(w).toContain("过期构建");
  });
});
