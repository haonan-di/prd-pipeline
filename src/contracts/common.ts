/**
 * 契约：公共枚举与工具输出信封
 * 配套 docs/CONTRACTS.md §6（全局契约，M0 冻结）
 */

import { z } from "zod";

/** 文档系统类型 */
export const DocSystemType = z.enum(["local", "confluence", "feishu", "notion", "other"]);

/** 交付模式 */
export const DeliveryMode = z.enum(["local_first", "remote_first"]);

/** 产品形态（联动合规依据源） */
export const ProductForm = z.enum(["c-end", "b-end"]);

/** 图表渲染策略（含 ask） */
export const RenderStrategy = z.enum(["source", "local", "ask", "remote"]);

/** 引擎自身支持的渲染策略（不含 ask） */
export const EngineStrategy = z.enum(["source", "local", "remote"]);

/** 预设类型（六类） */
export const PresetType = z.enum([
  "domain",
  "soul",
  "template",
  "compliance",
  "stages",
  "diagrams",
]);

/** config 状态 */
export const ConfigStatus = z.enum(["active", "draft"]);

/** 工具错误码（契约 §6.2，冻结） */
export const ErrorCode = z.enum([
  "NOT_INITIALIZED",
  "INVALID_INPUT",
  "PRESET_NOT_FOUND",
  "PRESET_INVALID",
  "TEMPLATE_NOT_FOUND",
  "PLACEHOLDER_MISSING",
  "PLACEHOLDER_UNRESOLVED",
  "DIAGRAM_INVALID",
  "DIAGRAM_ENGINE_UNKNOWN",
  "RENDER_REMOTE_DENIED",
  "TASK_NOT_FOUND",
  "IO_ERROR",
  "UNSUPPORTED",
]);

/** 工具错误体 */
export const ToolError = z.object({
  code: ErrorCode,
  message: z.string(),
  hint: z.string().optional(),
});

/** 成功信封构造器：{ ok: true, data } */
export const okEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ ok: z.literal(true), data });

/** 失败信封：{ ok: false, error } */
export const failEnvelope = z.object({ ok: z.literal(false), error: ToolError });

/** 成功信封（宽松 data） */
export const OkEnvelope = z.object({ ok: z.literal(true), data: z.unknown() });

/** 任意工具返回信封 */
export const ToolEnvelope = z.union([OkEnvelope, failEnvelope]);

export type DocSystemTypeT = z.infer<typeof DocSystemType>;
export type DeliveryModeT = z.infer<typeof DeliveryMode>;
export type ProductFormT = z.infer<typeof ProductForm>;
export type RenderStrategyT = z.infer<typeof RenderStrategy>;
export type EngineStrategyT = z.infer<typeof EngineStrategy>;
export type PresetTypeT = z.infer<typeof PresetType>;
export type ErrorCodeT = z.infer<typeof ErrorCode>;
export type ToolErrorT = z.infer<typeof ToolError>;
