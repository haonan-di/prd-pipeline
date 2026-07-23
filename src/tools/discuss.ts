/** 讨论引导 — prd/discuss.probe */

import type { ProbeStage } from "../types.js";
import { getProbes, getAllProbes, getAllStages } from "../probes/index.js";

export const DISCUSS_PROBE_TOOL = {
  name: "prd/discuss.probe",
  description:
    "Get structured discussion probes for a specific stage of the PRD discussion workflow. The agent should use these questions to guide the conversation with the user. The standard workflow order is: problem → solution → tradeoff → compliance → scope.",
  inputSchema: {
    type: "object",
    properties: {
      stage: {
        type: "string",
        enum: ["problem", "solution", "tradeoff", "compliance", "scope"],
        description:
          "Discussion stage:\n- problem: Problem definition — what problem are we solving?\n- solution: Solution exploration — compare approaches\n- tradeoff: Trade-off analysis — cost vs benefit\n- compliance: Compliance & legal review\n- scope: Scope definition — MVP vs future",
      },
      list_stages: {
        type: "boolean",
        description: "If true, list all available stages and their descriptions (ignores 'stage' parameter)",
      },
    },
    required: [],
  },
} as const;

export function handleDiscussProbe(args: Record<string, unknown>): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  // 如果请求列出所有阶段
  if (args.list_stages) {
    const allProbes = getAllProbes();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              workflow_order: getAllStages(),
              stages: allProbes,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const stage = args.stage as ProbeStage;

  if (!stage || !getAllStages().includes(stage)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: `Invalid stage: "${stage}". Valid stages: ${getAllStages().join(", ")}`,
              hint: "Set list_stages=true to see all available stages.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const probes = getProbes(stage);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(probes, null, 2),
      },
    ],
  };
}
