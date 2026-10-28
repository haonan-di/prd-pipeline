/**
 * 图表引擎注册表（契约 §5）—— 内置代码适配器 + 预设声明式引擎。
 */

import type { DiagramEngine, EngineDeclT } from "../contracts/index.js";
import { MermaidEngine } from "./engines/mermaid.js";
import { DeclarativeEngine } from "./engines/declarative.js";

export class EngineRegistry {
  private readonly engines = new Map<string, DiagramEngine>();

  constructor(declarations: EngineDeclT[] = []) {
    this.register(new MermaidEngine());
    for (const decl of declarations) this.register(new DeclarativeEngine(decl));
  }

  register(engine: DiagramEngine): void {
    this.engines.set(engine.name, engine);
  }

  get(name: string): DiagramEngine | undefined {
    return this.engines.get(name);
  }

  names(): string[] {
    return [...this.engines.keys()];
  }
}
