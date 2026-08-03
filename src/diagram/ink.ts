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

  if (hasBranch) {
    // 有分支：第一步作为判断节点
    lines.push(`    ${labels[0]}{${steps[0]}}`);

    // 尝试识别 "如果 A，是/通过 → B，否/拒绝 → C" 模式
    const branchMatch = description.match(
      /(判断|如果|if)\s*(.*?)[，,]\s*(是|true|通过)[：:：]?\s*(.*?)[，,]\s*(否|false|拒绝)[：:：]?\s*(.*)/i
    );
    if (branchMatch) {
      const yesAction = branchMatch[4].trim();
      const noAction = branchMatch[6].trim();
      lines.push(`    ${labels[0]} -->|${branchMatch[3]}| ${labels[1]}[${yesAction}]`);
      lines.push(`    ${labels[0]} -->|${branchMatch[5]}| ${labels[2]}[${noAction}]`);
    } else {
      // 无法解析分支结构，从第二步开始作为线性流程
      for (let i = 1; i < Math.min(steps.length, labels.length); i++) {
        lines.push(`    ${labels[i - 1]} --> ${labels[i]}[${steps[i]}]`);
      }
    }
  } else {
    // 线性流程图
    for (let i = 0; i < Math.min(steps.length, labels.length); i++) {
      lines.push(`    ${labels[i]}[${steps[i]}]`);
      if (i > 0) {
        lines.push(`    ${labels[i - 1]} --> ${labels[i]}`);
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
