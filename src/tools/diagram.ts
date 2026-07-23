/** 图表生成 — prd/diagram.flowchart, prd/diagram.sequence */

import { generateSimpleFlow, encodeMermaidInkUrl } from "../diagram/ink.js";
import type { DiagramResult } from "../types.js";

export const DIAGRAM_FLOWCHART_TOOL = {
  name: "prd/diagram.flowchart",
  description:
    "Generate a flowchart diagram from a description. Returns Mermaid code + optional mermaid.ink URL for platforms that don't render Mermaid natively.",
  inputSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Flow description — describe the process step by step",
      },
      format: {
        type: "string",
        enum: ["mermaid", "image", "both"],
        description:
          "Output format:\n- mermaid: return Mermaid code only (for Obsidian/GitHub)\n- image: return mermaid.ink URL only (for Confluence/Feishu)\n- both: return both",
        default: "both",
      },
    },
    required: ["description"],
  },
} as const;

export const DIAGRAM_SEQUENCE_TOOL = {
  name: "prd/diagram.sequence",
  description:
    "Generate a sequence diagram from a description. Returns Mermaid code + optional mermaid.ink URL.",
  inputSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Interaction description — describe who interacts with whom and in what order",
      },
      participants: {
        type: "array",
        items: { type: "string" },
        description: "List of participants/actors in the interaction",
      },
      format: {
        type: "string",
        enum: ["mermaid", "image", "both"],
        default: "both",
      },
    },
    required: ["description"],
  },
} as const;

/** 从描述生成 sequence diagram mermaid 代码 */
function generateSequenceMermaid(
  description: string,
  participants?: string[]
): string {
  const lines: string[] = ["sequenceDiagram"];

  // 添加参与者
  if (participants && participants.length > 0) {
    for (const p of participants) {
      lines.push(`    participant ${p}`);
    }
  }

  // 角色名匹配：中文 + 英文
  const actor = "[\\u4e00-\\u9fff\\w]+";

  // 从描述中解析交互步骤
  const steps = description
    .split(/[\n。；;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const step of steps) {
    let matched = false;

    // 1. "A 给/向 B 发送/返回/通知 xxx" — 最优先
    let m = step.match(
      new RegExp(`^(${actor})\\s*(给|向)\\s*(${actor})\\s*(发送|返回|展示|通知|传递|推送)\\s*(.*)$`)
    );
    if (m) {
      const [, from, , to, verb, msg] = m;
      const arrow = verb === "返回" ? "-->>" : "->>";
      lines.push(`    ${from}${arrow}${to}: ${msg || verb}`);
      continue;
    }

    // 2. "A 调用/请求 B 的 xxx" / "A 调用 B 接口"
    m = step.match(
      new RegExp(`^(${actor})\\s*(调用|请求)\\s*(${actor})\\s*[的]?\\s*(.*)$`)
    );
    if (m) {
      const [, from, verb, to, action] = m;
      lines.push(`    ${from}->>${to}: ${verb}${action ? ` ${action}` : ""}`);
      continue;
    }

    // 3. "A 返回 xxx 给 B" / "A 返回 xxx"
    m = step.match(
      new RegExp(`^(${actor})\\s*(返回)\\s*(.*?)\\s*(给)\\s*(${actor})$`)
    );
    if (m) {
      const [, from, , msg, , to] = m;
      lines.push(`    ${from}-->>${to}: ${msg}`);
      continue;
    }
    m = step.match(new RegExp(`^(${actor})\\s*(返回)\\s*(.*)$`));
    if (m) {
      const [, from, , msg] = m;
      lines.push(`    ${from}-->>${from}: ${msg}`);
      continue;
    }

    // 4. "A 展示/显示/提示/跳转 xxx" (单参与者)
    m = step.match(
      new RegExp(`^(${actor})\\s*(展示|显示|提示|跳转|进入|打开|关闭|弹出)\\s*(.*)$`)
    );
    if (m) {
      const [, actor_name, action, target] = m;
      lines.push(`    ${actor_name}->>${actor_name}: ${action}${target}`);
      continue;
    }

    // 5. "A 发送/通知/传给 xxx" (接收方不明确)
    m = step.match(new RegExp(`^(${actor})\\s*(发送|通知|传给|推送)\\s*(.*)$`));
    if (m) {
      const [, from, verb, msg] = m;
      lines.push(`    ${from}->>System: ${verb}${msg ? ` ${msg}` : ""}`);
      continue;
    }

    // 6. "A -> B: msg" 标准格式
    m = step.match(
      new RegExp(`^(${actor})\\s*(->|-->|-x|->>)\\s*(${actor})[：:：]?\\s*(.*)$`)
    );
    if (m) {
      const [, from, arrow, to, msg] = m;
      lines.push(`    ${from}${arrow}${to}: ${msg || "交互"}`);
      continue;
    }

    // 7. 兜底：Note
    lines.push(`    Note over all: ${step}`);
  }

  return lines.join("\n");
}

function buildResult(
  mermaidCode: string,
  format: string
): DiagramResult {
  const result: DiagramResult = { mermaid: mermaidCode };

  if (format === "image" || format === "both") {
    try {
      result.mermaid_ink_url = encodeMermaidInkUrl(mermaidCode, "svg");
    } catch {
      // 编码失败时只返回 code
    }
  }

  return result;
}

export function handleDiagramFlowchart(args: Record<string, unknown>): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  try {
    const description = args.description as string;
    const format = (args.format as string) || "both";

    if (!description || description.trim() === "") {
      return {
        content: [{ type: "text", text: "Description is required." }],
        isError: true,
      };
    }

    const mermaidCode = generateSimpleFlow(description);
    const result = buildResult(mermaidCode, format);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error generating flowchart: ${error}` }],
      isError: true,
    };
  }
}

export function handleDiagramSequence(args: Record<string, unknown>): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  try {
    const description = args.description as string;
    const participants = args.participants as string[] | undefined;
    const format = (args.format as string) || "both";

    if (!description || description.trim() === "") {
      return {
        content: [{ type: "text", text: "Description is required." }],
        isError: true,
      };
    }

    const mermaidCode = generateSequenceMermaid(description, participants);
    const result = buildResult(mermaidCode, format);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error generating sequence diagram: ${error}` }],
      isError: true,
    };
  }
}
