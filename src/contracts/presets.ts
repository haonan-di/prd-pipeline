/**
 * 契约：六类预设
 * 配套 docs/CONTRACTS.md §3（全局契约，M0 冻结）
 *
 * 形态：Markdown + YAML frontmatter；frontmatter 承载结构化元数据。
 */

import { z } from "zod";
import { PresetType, ProductForm, EngineStrategy } from "./common.js";
import { Probe } from "./discuss.js";

/** 所有预设共有的 frontmatter */
export const PresetBase = z.object({
  name: z.string(),
  type: PresetType,
  description: z.string().default(""),
  version: z.number().default(1),
});

/* template */
export const Placeholder = z.object({
  key: z.string(),
  label: z.string().optional(),
  required: z.boolean().default(true),
});

export const TemplatePreset = PresetBase.extend({
  type: z.literal("template"),
  placeholders: z.array(Placeholder),
});

/* stages */
export const StageDef = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  probe_ref: z.string().optional(),
  /** 该阶段的探针（默认内联在此，契约 §7.1） */
  probes: z.array(Probe).default([]),
});

export const StagesPreset = PresetBase.extend({
  type: z.literal("stages"),
  stages: z.array(StageDef),
});

/* diagrams */
export const EngineDecl = z.object({
  name: z.string(),
  source_format: z.string(),
  strategies: z.array(EngineStrategy),
  options: z.record(z.any()).optional(),
});

export const DiagramsPreset = PresetBase.extend({
  type: z.literal("diagrams"),
  engines: z.array(EngineDecl),
});

/* compliance */
export const ComplianceAppliesTo = z.object({
  product_form: ProductForm.optional(),
  domain: z.string().optional(),
  jurisdiction: z.string().optional(),
});

export const CompliancePreset = PresetBase.extend({
  type: z.literal("compliance"),
  applies_to: ComplianceAppliesTo.default({}),
  /** 合规阶段的探针（审查依据源的一部分，契约 §7.1 / §8.2） */
  probes: z.array(Probe).default([]),
});

/* domain / soul */
export const DomainPreset = PresetBase.extend({
  type: z.literal("domain"),
  /** 领域识别关键词（用于 prd/domain.detect 打分；长度>=2 才参与匹配） */
  keywords: z.array(z.string()).default([]),
  /** 领域红线探针（合规阶段与合规依据源叠加，契约 §8.2） */
  probes: z.array(Probe).default([]),
});
export const SoulPreset = PresetBase.extend({ type: z.literal("soul") });

/** 六类预设判别联合 */
export const Preset = z.discriminatedUnion("type", [
  DomainPreset,
  SoulPreset,
  TemplatePreset,
  CompliancePreset,
  StagesPreset,
  DiagramsPreset,
]);

/** 预设发现项（preset.list 返回） */
export const PresetListItem = z.object({
  type: PresetType,
  name: z.string(),
  description: z.string().default(""),
  source: z.enum(["builtin", "custom"]),
  path: z.string(),
  /** 自定义预设覆盖了同名内置预设时为 true，提醒用户内置那份已不生效 */
  overrides_builtin: z.boolean().default(false),
});

export const PresetListResult = z.object({
  presets: z.array(PresetListItem),
});

/** 预设校验错误（preset.validate 返回） */
export const PresetValidationError = z.object({
  file: z.string(),
  field: z.string(),
  message: z.string(),
});

export type PresetT = z.infer<typeof Preset>;
export type StageDefT = z.infer<typeof StageDef>;
export type TemplatePresetT = z.infer<typeof TemplatePreset>;
export type StagesPresetT = z.infer<typeof StagesPreset>;
export type DiagramsPresetT = z.infer<typeof DiagramsPreset>;
export type CompliancePresetT = z.infer<typeof CompliancePreset>;
export type EngineDeclT = z.infer<typeof EngineDecl>;
export type PresetListItemT = z.infer<typeof PresetListItem>;
