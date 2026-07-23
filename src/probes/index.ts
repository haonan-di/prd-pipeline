/** 探针问题库 — 各阶段的引导问题 */

import type { ProbeStage, ProbeQuestion } from "../types.js";

/** 预定义的探针问题 */
const PROBES: Record<ProbeStage, ProbeQuestion> = {
  problem: {
    stage: "problem",
    questions: [
      "这个需求的真实用户是谁？用户规模有多大？",
      "用户在什么场景下会遇到这个问题？频次如何？",
      "当前用户是怎么解决这个问题的？（Workaround 是什么）",
      "不做这个需求，对用户和业务分别有什么影响？",
      "有没有数据可以量化这个问题的影响程度？",
    ],
  },
  solution: {
    stage: "solution",
    questions: [
      "有哪些可能的解决方案？各自的优缺点是什么？",
      "每个方案的实现成本和技术复杂度如何？",
      "每个方案对用户体验的影响是什么？",
      "有没有可以参考的行业最佳实践或竞品方案？",
      "最小可用方案（MVP）应该包含哪些核心能力？",
    ],
  },
  tradeoff: {
    stage: "tradeoff",
    questions: [
      "选择这个方案，放弃了什么？",
      "这个方案的技术成本和维护成本在可接受范围内吗？",
      "这个选择对后续扩展性有什么影响？",
      "有没有更简单的办法能达到同样的效果？",
      "这个方案的失败风险是什么？回滚方案是什么？",
    ],
  },
  compliance: {
    stage: "compliance",
    questions: [
      "这个需求涉及哪些合规/法务关注点？",
      "需要哪些审批流程？（法务、合规、安全）",
      "是否存在用户数据收集/使用方面的合规要求？",
      "是否需要考虑行业特定的监管要求？",
      "这个需求有资金安全或数据安全风险吗？",
    ],
  },
  scope: {
    stage: "scope",
    questions: [
      "这个需求的 MVP 范围是什么？哪些可以放在二期？",
      "有没有依赖其他团队或系统的前置条件？",
      "上线后如何验证效果？成功的标准是什么？",
      "灰度方案怎么设计？（分桶、流量比例、扩量节奏）",
      "上线后需要哪些数据报表来持续监控？",
    ],
  },
};

/** 获取指定阶段的探针问题 */
export function getProbes(stage: ProbeStage): ProbeQuestion {
  return PROBES[stage];
}

/** 获取所有阶段 */
export function getAllStages(): ProbeStage[] {
  return Object.keys(PROBES) as ProbeStage[];
}

/** 获取所有探针问题（带阶段说明） */
export function getAllProbes(): Record<ProbeStage, ProbeQuestion & { stage_description: string }> {
  const stageDescriptions: Record<ProbeStage, string> = {
    problem: "问题定义 — 明确需求要解决的真实问题",
    solution: "方案探讨 — 对比不同解决方案的优劣",
    tradeoff: "取舍分析 — 评估方案选择的代价和风险",
    compliance: "合规审查 — 检查合规/法务/安全风险",
    scope: "范围界定 — 确定 MVP 范围和灰度策略",
  };

  const result = {} as Record<ProbeStage, ProbeQuestion & { stage_description: string }>;
  for (const stage of getAllStages()) {
    result[stage] = {
      ...PROBES[stage],
      stage_description: stageDescriptions[stage],
    };
  }
  return result;
}
