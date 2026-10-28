/**
 * 契约：图表引擎接口与 mermaid.ink 编码
 * 配套 docs/CONTRACTS.md §5（全局契约，M0 冻结）
 */

import { z } from "zod";
import { deflateSync } from "node:zlib";
import { EngineStrategy, type EngineStrategyT } from "./common.js";

/** 图表构建结果 */
export const DiagramBuildResult = z.object({
  source: z.string(),
  source_format: z.string(),
  strategy_used: EngineStrategy,
  image_url: z.string().optional(),
  local_path: z.string().optional(),
  warnings: z.array(z.string()).default([]),
});

export type DiagramBuildResultT = z.infer<typeof DiagramBuildResult>;

/** 引擎校验结果 */
export type EngineValidateResult = { ok: true } | { ok: false; errors: string[] };

/** 引擎接口（内置代码适配器，契约 §5.1） */
export interface DiagramEngine {
  readonly name: string;
  readonly sourceFormat: string;
  readonly strategies: readonly EngineStrategyT[];
  validate(code: string): EngineValidateResult;
  build(
    code: string,
    strategy: EngineStrategyT,
    opts?: Record<string, unknown>
  ): Promise<DiagramBuildResultT>;
}

/**
 * 冻结的 mermaid.ink 编码（契约 §5.3）。
 *
 * 关键：payload 必须是 JSON 包装 `{ code, mermaid: { theme } }`，
 * 再做 zlib deflate（RFC1950，等价 pako.deflate）+ base64url。
 * 旧实现直接 deflate 源码字符串 → 400，此处为修正后的正确形式。
 */
export function encodeMermaidInkUrl(
  mermaidCode: string,
  format: "svg" | "img" = "svg"
): string {
  const payload = JSON.stringify({ code: mermaidCode, mermaid: { theme: "default" } });
  const compressed = deflateSync(Buffer.from(payload, "utf-8"));
  const encoded = compressed
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `https://mermaid.ink/${format}/${encoded}`;
}

/** 声明式引擎的 URL 编码（契约 §5.2 options.encode） */
export function encodeDeclarative(
  code: string,
  encode: string
): string {
  if (encode === "deflate+base64url") {
    const compressed = deflateSync(Buffer.from(code, "utf-8"));
    return compressed
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  if (encode === "base64url") {
    return Buffer.from(code, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  throw new Error(`Unsupported encode: ${encode}`);
}
