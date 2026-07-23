/** 模板渲染引擎 — 将模板变量替换为实际内容 */

/**
 * 渲染模板：将模板中的 {变量名} 替换为实际值
 * 支持：
 *   - {变量名} → 简单替换
 *   - {#section}...{/section} → 条件块（如果变量有值则渲染）
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  // 1. 替换条件块 {#key}...{/key}
  // 如果 key 对应的变量有值（非空），保留块内容并移除标记
  // 如果 key 无值，移除整个块
  const blockRegex = /\{#(\w+)\}([\s\S]*?)\{\/\1\}/g;
  result = result.replace(blockRegex, (match, key, content) => {
    if (variables[key] && variables[key].trim() !== "") {
      return content;
    }
    return "";
  });

  // 2. 替换简单变量 {变量名}（支持中文）
  result = result.replace(/\{([^}]+)\}/g, (match, key) => {
    if (variables[key] !== undefined) {
      return variables[key];
    }
    // 保留未定义的变量
    return match;
  });

  return result;
}

/**
 * 生成 PRD 文件名（基于标题和日期）
 */
export function generatePrdFilename(title: string, version?: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeTitle = title
    .replace(/[<>:"/\\|?*]/g, "") // 移除非法字符
    .replace(/\s+/g, "-")
    .slice(0, 50);
  const ver = version ? `-v${version}` : "";
  return `${date}-${safeTitle}${ver}.md`;
}
