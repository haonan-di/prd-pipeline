/**
 * diagram 工具（契约 §4 E2 / §5）—— 引擎可插拔图表管道
 * 取代旧的 diagram.flowchart / diagram.sequence（正则解析，已废弃）。
 */

import { readConfig } from "../config.js";
import { discoverPresets, loadPresetFile } from "../presets/loader.js";
import { EngineRegistry } from "../diagram/registry.js";
import { EngineDecl, type EngineDeclT, type RenderStrategyT } from "../contracts/index.js";
import { okResult, failResult } from "../envelope.js";

export const DIAGRAM_BUILD_TOOL = {
  name: "prd/diagram.build",
  description:
    "图表管道：校验图源码 → 按引擎与渲染策略产出交付物。默认引擎 mermaid。渲染策略受 config.diagram.render 约束。",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "图源码（由 agent 按图表规范撰写）" },
      engine: { type: "string", description: "引擎名，默认取 config.diagram.default_engine" },
      strategy: { type: "string", enum: ["source", "local", "remote"] },
      format: { type: "string", enum: ["svg", "img"], default: "svg" },
      confirm_remote: {
        type: "boolean",
        description: "config.diagram.render=ask 时，选用 remote 必须显式确认（数据外发）",
      },
    },
    required: ["code"],
  },
} as const;

/** 从 presets/diagrams/*.md 收集声明式引擎 */
function loadEngineDecls(presetDirs: string[]): EngineDeclT[] {
  const decls: EngineDeclT[] = [];
  for (const item of discoverPresets({ presetDirs }).filter((p) => p.type === "diagrams")) {
    const parsed = loadPresetFile(item.path);
    const engines = parsed?.frontmatter?.engines;
    if (!Array.isArray(engines)) continue;
    for (const e of engines) {
      const r = EngineDecl.safeParse(e);
      if (r.success) decls.push(r.data);
    }
  }
  return decls;
}

/** 按 config.diagram.render 策略与显式确认，决定实际渲染策略（契约 §5.3） */
function resolveStrategy(
  policy: RenderStrategyT,
  requested: "source" | "local" | "remote" | undefined,
  confirmRemote: boolean
): { strategy: "source" | "local" | "remote"; denied?: string } {
  if (policy === "source") return { strategy: "source" };
  if (policy === "local") return { strategy: requested === "source" ? "source" : "local" };
  if (policy === "remote") return { strategy: requested ?? "remote" };
  // ask（默认）
  const s = requested ?? "source";
  if (s === "remote" && !confirmRemote) {
    return { strategy: "source", denied: "策略为 ask：使用 remote（第三方外发）需 confirm_remote=true" };
  }
  return { strategy: s };
}

export async function handleDiagramBuild(args: Record<string, unknown>) {
  try {
    const code = (args.code as string) ?? "";
    if (code.trim() === "") return failResult("INVALID_INPUT", "缺少图源码 code");

    const config = readConfig()?.config;
    const engineName =
      (args.engine as string) || config?.diagram.default_engine || "mermaid";
    const registry = new EngineRegistry(loadEngineDecls(config?.preset_dirs ?? []));
    const engine = registry.get(engineName);
    if (!engine) {
      return failResult(
        "DIAGRAM_ENGINE_UNKNOWN",
        `未知引擎「${engineName}」`,
        `可用引擎：${registry.names().join(", ")}`
      );
    }

    const validation = engine.validate(code);
    if (!validation.ok) {
      return failResult("DIAGRAM_INVALID", `图源码校验失败：${validation.errors.join("；")}`);
    }

    const { strategy, denied } = resolveStrategy(
      config?.diagram.render ?? "ask",
      args.strategy as "source" | "local" | "remote" | undefined,
      Boolean(args.confirm_remote)
    );
    if (denied) return failResult("RENDER_REMOTE_DENIED", denied, "或改用 strategy=source");

    if (strategy === "local" && !engine.strategies.includes("local")) {
      // 引擎不支持 local，降级为 source 并告警
      const result = await engine.build(code, "source", { format: args.format });
      return okResult({
        ...result,
        warnings: [...(result.warnings ?? []), `引擎 ${engineName} 暂不支持 local，已降级为 source`],
        policy: config?.diagram.render ?? "ask",
      });
    }

    const result = await engine.build(code, strategy, { format: args.format });
    return okResult({ ...result, engine: engineName, policy: config?.diagram.render ?? "ask" });
  } catch (error) {
    return failResult("DIAGRAM_INVALID", `图表构建失败：${String(error)}`);
  }
}
