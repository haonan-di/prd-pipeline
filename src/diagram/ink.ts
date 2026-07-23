/** mermaid.ink 编码工具 — zlib + base64 编码 */

import { deflateSync } from "node:zlib";

/**
 * 将 Mermaid 代码编码为 mermaid.ink URL
 *
 * mermaid.ink 使用 pako (zlib deflate) + base64url 编码
 * 参考：https://github.com/jgraph/drawio/blob/master/src/main/webapp/js/mxgraph/mxClient.js
 */
export function encodeMermaidInkUrl(
  mermaidCode: string,
  format: "svg" | "img" = "svg"
): string {
  const compressed = deflateSync(Buffer.from(mermaidCode, "utf-8"));
  const encoded = compressed
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `https://mermaid.ink/${format}/${encoded}`;
}

/**
 * 生成几种常见的流程图模板
 */

/** 简单流程：开始 → 判断 → 分支 */
export function generateSimpleFlow(description: string): string {
  // 从描述中提取步骤（按换行或句号分割）
  const steps = description
    .split(/[\n。；;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (steps.length === 0) {
    return `graph TD\n    A[开始] --> B[结束]`;
  }

  const lines: string[] = ["graph TD"];
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  // 判断是否有分支逻辑
  const hasBranch = description.includes("判断") || description.includes("如果") || description.includes("if");

  if (hasBranch && steps.length >= 3) {
    // 生成带分支的流程图
    lines.push(`    ${labels[0]}{${steps[0]}}`);
    let nodeIdx = 1;
    let labelIdx = 1;

    // 尝试识别分支
    const branchMatch = description.match(/(判断|如果|if)\s*(.*?)[，,]\s*(是|true|通过)[：:：]?\s*(.*?)[，,]\s*(否|false|拒绝)[：:：]?\s*(.*)/i);
    if (branchMatch) {
      const yesAction = branchMatch[4].trim();
      const noAction = branchMatch[6].trim();
      lines.push(`    ${labels[0]} -->|${branchMatch[3]}| ${labels[labelIdx]}[${yesAction}]`);
      labelIdx++;
      lines.push(`    ${labels[0]} -->|${branchMatch[5]}| ${labels[labelIdx]}[${noAction}]`);
    } else {
      // 简单线性流程
      for (let i = 1; i < steps.length; i++) {
        const currentLabel = labels[labelIdx] || `N${labelIdx}`;
        lines.push(`    ${labels[labelIdx - 1]} --> ${currentLabel}[${steps[i]}]`);
        labelIdx++;
      }
    }
  } else {
    // 线性流程图
    for (let i = 0; i < steps.length; i++) {
      const label = labels[i] || `N${i}`;
      const shape = i === 0 ? `${label}[${steps[i]}]` : `${label}[${steps[i]}]`;
      lines.push(`    ${label}[${steps[i]}]`);
      if (i > 0) {
        lines.push(`    ${labels[i - 1]} --> ${label}`);
      }
    }
  }

  return lines.join("\n");
}

/** 泳道图（按角色分组） */
export function generateSwimlane(description: string): string {
  // 简单实现：用 graph TD 模拟泳道，按角色分组
  const lines: string[] = ["graph TD"];
  const roles = description.match(/(\w+[：:]\s*[^\n]+)/g);

  if (roles) {
    roles.forEach((role, i) => {
      const label = String.fromCharCode(65 + i);
      lines.push(`    subgraph ${role.split(/[：:]/)[0]}`);
      lines.push(`        ${label}[${role.split(/[：:]/)[1]?.trim() || role}]`);
      lines.push(`    end`);
    });
  }

  return lines.join("\n");
}
