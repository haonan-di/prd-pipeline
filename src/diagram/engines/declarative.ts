/**
 * 声明式引擎（契约 §5.2）—— 用户在预设里声明，无需写代码即可接入新工具。
 * 由 options.encode 与 options.remote_url 模板驱动。
 */

import {
  encodeDeclarative,
  type DiagramEngine,
  type DiagramBuildResultT,
  type EngineDeclT,
  type EngineStrategyT,
  type EngineValidateResult,
} from "../../contracts/index.js";

export class DeclarativeEngine implements DiagramEngine {
  readonly name: string;
  readonly sourceFormat: string;
  readonly strategies: EngineStrategyT[];
  private readonly opts: Record<string, unknown>;

  constructor(decl: EngineDeclT) {
    this.name = decl.name;
    this.sourceFormat = decl.source_format;
    this.strategies = decl.strategies;
    this.opts = (decl.options ?? {}) as Record<string, unknown>;
  }

  validate(code: string): EngineValidateResult {
    return code.trim() === "" ? { ok: false, errors: ["图表源码为空"] } : { ok: true };
  }

  async build(
    code: string,
    strategy: EngineStrategyT,
    _opts?: Record<string, unknown>
  ): Promise<DiagramBuildResultT> {
    const base: DiagramBuildResultT = {
      source: code,
      source_format: this.sourceFormat,
      strategy_used: strategy,
      warnings: [],
    };

    if (strategy === "source") return base;

    if (strategy === "remote") {
      const encode = (this.opts.encode as string) ?? "base64url";
      const template = this.opts.remote_url as string | undefined;
      if (!template) throw new Error(`引擎 ${this.name} 未声明 remote_url`);
      const encoded = encodeDeclarative(code, encode);
      return { ...base, image_url: template.replace("{encoded}", encoded) };
    }

    throw new Error(`声明式引擎 ${this.name} 不支持策略：${strategy}`);
  }
}
