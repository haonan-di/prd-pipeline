/**
 * 构建新鲜度检查（M7 复盘产物）
 *
 * 背景：dist/ 落后于 src/ 时，server 表面工作正常，但跑的是旧代码。dogfood 时
 * 因此把旧构建的行为误判成源码缺陷，浪费了一轮。这里在启动时比对 mtime，
 * 只做提示、不阻断启动——构建过期的用途仍然存在（例如只想跑通链路）。
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface NewestSource {
  file: string;
  mtimeMs: number;
}

export interface FreshnessReport {
  stale: boolean;
  reason?: string;
  newestSource?: NewestSource;
  buildMtimeMs?: number;
}

/** 递归找出目录下最新的 .ts 文件（只看源码，忽略 map/d.ts 等产物） */
export function newestSourceFile(dir: string): NewestSource | null {
  if (!existsSync(dir)) return null;
  let best: NewestSource | null = null;

  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(p);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".d.ts")) continue;
      const mtimeMs = statSync(p).mtimeMs;
      if (best === null || mtimeMs > best.mtimeMs) best = { file: p, mtimeMs };
    }
  };

  walk(dir);
  return best;
}

/**
 * @param distFile 构建产物入口（通常是 dist/index.js）
 * @param srcDir   源码目录（通常是 ../src）
 * @param toleranceMs 允许的时钟/写入抖动，默认 1000ms
 */
export function checkBuildFreshness(
  distFile: string,
  srcDir: string,
  toleranceMs = 1000
): FreshnessReport {
  if (!existsSync(distFile)) {
    return { stale: true, reason: "未找到构建产物，请先运行 npm run build" };
  }

  const newest = newestSourceFile(srcDir);
  if (newest === null) {
    // 发布包内不带 src 是正常的，不作为过期处理
    return { stale: false };
  }

  const buildMtimeMs = statSync(distFile).mtimeMs;
  const stale = newest.mtimeMs > buildMtimeMs + toleranceMs;

  return {
    stale,
    buildMtimeMs,
    newestSource: newest,
    reason: stale
      ? `dist 比 src 旧（最新源码：${newest.file}）`
      : undefined,
  };
}

/** 供启动时直接打印的一段提示；不需要提示时返回 null */
export function freshnessWarning(distFile: string, srcDir: string): string | null {
  const report = checkBuildFreshness(distFile, srcDir);
  if (!report.stale) return null;
  return (
    `[prd-pipeline] 警告：${report.reason}。` +
    `本次运行可能使用的是过期构建，结论不可信；请先执行 npm run build。`
  );
}
