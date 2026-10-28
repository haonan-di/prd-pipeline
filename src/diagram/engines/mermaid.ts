/**
 * mermaid 引擎（契约 §5.1 / §5.3）—— 默认引擎。
 * 出图策略：source（零外发）/ remote（mermaid.ink，有外发）。
 */

import {
  encodeMermaidInkUrl,
  type DiagramEngine,
  type DiagramBuildResultT,
  type EngineStrategyT,
  type EngineValidateResult,
} from "../../contracts/index.js";

/** mermaid 图类型的起始关键字 */
const MERMAID_HEADERS = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "mindmap",
  "timeline",
  "gitGraph",
  "quadrantChart",
  "xychart-beta",
  "block-beta",
  "sankey-beta",
];

export class MermaidEngine implements DiagramEngine {
  readonly name = "mermaid";
  readonly sourceFormat = "mermaid";
  readonly strategies = ["source", "remote"] as const;

  validate(code: string): EngineValidateResult {
    const trimmed = code.trim();
    if (trimmed === "") return { ok: false, errors: ["图表源码为空"] };
    const first = trimmed.split(/\r?\n/)[0].trim();
    if (!MERMAID_HEADERS.some((h) => first.startsWith(h))) {
      return { ok: false, errors: [`无法识别的 mermaid 图类型起始行：${first}`] };
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

    if (strategy === "remote") {
      const format = (opts?.format as "svg" | "img") ?? "svg";
      return { ...base, image_url: encodeMermaidInkUrl(code, format) };
    }

    throw new Error(`mermaid 引擎暂不支持渲染策略：${strategy}`);
  }
}
