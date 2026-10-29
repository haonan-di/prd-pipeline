/**
 * drawio 引擎（M5）—— 只出源码与本地文件，不做渲染。
 *
 * 为什么不做渲染：本机没有 drawio CLI，服务端渲染 PNG/SVG 需要额外安装或
 * 无头浏览器 + drawio 前端，代价远大于收益。`.drawio` 本质是 XML，
 * 直接产出可导入的文件，用户在 drawio 里打开即可二次编辑与导出，
 * 这已经覆盖了「local 出图 + 二次编辑」的主要诉求。
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DiagramBuildResultT,
  DiagramEngine,
  EngineStrategyT,
  EngineValidateResult,
} from "../../contracts/index.js";

export class DrawioEngine implements DiagramEngine {
  readonly name = "drawio";
  readonly sourceFormat = "drawio";
  readonly strategies = ["source", "local"] as const;

  validate(code: string): EngineValidateResult {
    const trimmed = code.trim();
    if (trimmed === "") return { ok: false, errors: ["图表源码为空"] };
    if (!/^<mxfile[\s>]/.test(trimmed) && !/^<mxGraphModel[\s>]/.test(trimmed)) {
      return {
        ok: false,
        errors: ["drawio 源码应以 <mxfile 或 <mxGraphModel 开头（drawio 文件本质是 XML）"],
      };
    }
    return { ok: true };
  }

  async build(
    code: string,
    strategy: EngineStrategyT,
    opts?: Record<string, unknown>
  ): Promise<DiagramBuildResultT> {
    const base: DiagramBuildResultT = {
      source: code,
      source_format: this.sourceFormat,
      strategy_used: strategy,
      warnings: [],
    };

    if (strategy === "source") return base;

    if (strategy === "local") {
      const outDir = (opts?.out_dir as string) ?? join(tmpdir(), "prd-diagram");
      mkdirSync(outDir, { recursive: true });
      const hash = createHash("sha1").update(code).digest("hex").slice(0, 8);
      const file = join(outDir, `diagram-${hash}.drawio`);
      writeFileSync(file, code, "utf-8");
      return {
        ...base,
        strategy_used: "local",
        local_path: file,
        warnings: [
          ...base.warnings,
          "已生成本地 .drawio 文件；导出 PNG/SVG 需在 drawio 中打开（本机未检测到 drawio CLI）",
        ],
      };
    }

    throw new Error(`drawio 引擎不支持渲染策略：${strategy}`);
  }
}
