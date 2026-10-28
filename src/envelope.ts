/**
 * 工具输出信封助手（契约 §6.1）
 * 所有工具返回 { ok:true, data } 或 { ok:false, error:{code,message,hint} }。
 */

import type { ErrorCodeT } from "./contracts/index.js";

export type ToolTextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function okResult(data: unknown): ToolTextResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, data }, null, 2) }],
  };
}

export function failResult(code: ErrorCodeT, message: string, hint?: string): ToolTextResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: false, error: { code, message, hint } }, null, 2),
      },
    ],
    isError: true,
  };
}
