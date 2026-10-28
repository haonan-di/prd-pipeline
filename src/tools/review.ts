/**
 * review 工具（契约 §4 F1 / §8.1）—— 确定性检查
 * 语义审查（F2）由 agent 依「合规依据源 + 领域 + 产品形态」清单执行。
 */

import { findUnresolvedPlaceholders } from "../contracts/template.js";
import type { ReviewFindingT } from "../contracts/index.js";
import { okResult, failResult } from "../envelope.js";

export const REVIEW_CHECK_TOOL = {
  name: "prd/review.check",
  description:
    "PRD 确定性检查：残留占位符 / 空章节 / 修订记录缺失 / 无量化目标 / 全文无图。返回问题清单（含级别）。",
  inputSchema: {
    type: "object",
    properties: { content: { type: "string", description: "PRD 正文（markdown）" } },
    required: ["content"],
  },
} as const;

export function handleReviewCheck(args: Record<string, unknown>) {
  const content = (args.content as string) ?? "";
  if (content.trim() === "") return failResult("INVALID_INPUT", "缺少 content");

  const findings: ReviewFindingT[] = [];

  // 1. 残留占位符
  const unresolved = findUnresolvedPlaceholders(content);
  if (unresolved.length > 0) {
    findings.push({
      code: "PLACEHOLDER_UNRESOLVED",
      severity: "P0",
      position: unresolved.join(", "),
      suggestion: "补齐这些章节，或修正模板占位符与 sections 的对齐",
    });
  }

  // 2. 空章节
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    let body = "";
    while (j < lines.length && !/^##\s+/.test(lines[j])) {
      body += lines[j];
      j++;
    }
    if (body.trim() === "") {
      findings.push({
        code: "SECTION_EMPTY",
        severity: "P1",
        position: m[1].trim(),
        suggestion: "该章节为空，补充内容或移除",
      });
    }
  }

  // 3. 修订记录
  if (!/修订记录/.test(content)) {
    findings.push({
      code: "CHANGELOG_MISSING",
      severity: "P0",
      position: "全文",
      suggestion: "补充 PRD 修订记录表（版本/时间/修订内容/修订人）",
    });
  }

  // 4. 量化目标
  if (!/指标/.test(content) || !/\|.*\|/.test(content)) {
    findings.push({
      code: "METRICS_MISSING",
      severity: "P1",
      position: "目标和收益",
      suggestion: "补充量化目标表（指标/当前值/目标值/衡量方式）",
    });
  }

  // 5. 图
  if (!/```mermaid/.test(content)) {
    findings.push({
      code: "DIAGRAM_MISSING",
      severity: "P2",
      position: "全文",
      suggestion: "至少补一张流程图/时序图，把关键链路讲清楚",
    });
  }

  return okResult({ findings, passed: findings.length === 0 });
}
