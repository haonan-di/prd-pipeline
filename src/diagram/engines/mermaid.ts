/**
 * mermaid 引擎（契约 §5.1 / §5.3）—— 默认引擎。
 * 出图策略：
 *   source —— 只出源码，零外发
 *   local  —— 无头浏览器本机渲染（M5），图内容不外发
 *   remote —— mermaid.ink，内容发给第三方
 */

import {
  encodeMermaidInkUrl,
  type DiagramEngine,
  type DiagramBuildResultT,
  type EngineStrategyT,
  type EngineValidateResult,
} from "../../contracts/index.js";
import { renderMermaidLocal, writeRenderedFile } from "../browser.js";

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
  readonly strategies = ["source", "local", "remote"] as const;

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

    if (strategy === "local") {
      const format = (opts?.format as "svg" | "img") ?? "svg";
      const outDir = opts?.out_dir as string | undefined;
      try {
        const rendered = await renderMermaidLocal(code, { format, outDir });
        const localPath = writeRenderedFile(code, rendered, outDir);
        const warnings = [...base.warnings];
        if (rendered.external_script) {
          warnings.push(
            "本机未安装 mermaid 包，已退回 CDN 加载脚本：图内容不外发，但渲染需要联网"
          );
        }
        return { ...base, strategy_used: "local", local_path: localPath, warnings };
      } catch (error) {
        return {
          ...base,
          strategy_used: "source",
          warnings: [
            ...base.warnings,
            `本地渲染失败，已降级为 source：${error instanceof Error ? error.message : String(error)}`,
          ],
        };
      }
    }

    if (strategy === "remote") {
      const format = (opts?.format as "svg" | "img") ?? "svg";
      return { ...base, image_url: encodeMermaidInkUrl(code, format) };
    }

    throw new Error(`mermaid 引擎暂不支持渲染策略：${strategy}`);
  }
}
