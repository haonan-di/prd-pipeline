/**
 * 契约：讨论探针与审查项
 * 配套 docs/CONTRACTS.md §7 / §8（全局契约，M0 冻结）
 */

import { z } from "zod";

/* ───────── 探针 ───────── */

export const ProbeOption = z.object({
  label: z.string(),
  value: z.string(),
  recommended: z.boolean().default(false),
  rationale: z.string().optional(),
});

export const Probe = z.object({
  id: z.string(),
  /** 所属阶段；预设中可省略，由 prd/discuss.probe 按当前阶段填充 */
  stage: z.string().optional(),
  question: z.string(),
  options: z.array(ProbeOption).optional(),
  allow_open: z.boolean().default(false),
});

export const ProbeSet = z.object({
  stage: z.string(),
  title: z.string().optional(),
  probes: z.array(Probe),
});

export type ProbeT = z.infer<typeof Probe>;
export type ProbeOptionT = z.infer<typeof ProbeOption>;

/* ───────── 审查 ───────── */

/** 确定性检查项（契约 §8.1，可枚举） */
export const ReviewCheckCode = z.enum([
  "PLACEHOLDER_UNRESOLVED",
  "SECTION_EMPTY",
  "CHANGELOG_MISSING",
  "METRICS_MISSING",
  "DIAGRAM_MISSING",
]);

export const ReviewFinding = z.object({
  code: ReviewCheckCode,
  severity: z.enum(["P0", "P1", "P2"]),
  position: z.string(),
  suggestion: z.string(),
});

export const ReviewCheckResult = z.object({
  findings: z.array(ReviewFinding),
  passed: z.boolean(),
});

export type ReviewFindingT = z.infer<typeof ReviewFinding>;
export type ReviewCheckCodeT = z.infer<typeof ReviewCheckCode>;
