/**
 * 契约：模板占位符语法与检出具
 * 配套 docs/CONTRACTS.md §4（全局契约，M0 冻结）
 *
 * 语法：变量 `{{key}}`；条件块 `{{#key}}...{{/key}}`
 * （采用双花括号，取代旧的单花括号，避免与正文冲突）
 */

/** 匹配任一占位符（变量或条件块标记） */
const PLACEHOLDER_RE = /\{\{\s*([#/]?)([^{}]+?)\s*\}\}/g;

/** 提取文本中残留的占位符键（去重，去除 # / 前缀） */
export function findUnresolvedPlaceholders(text: string): string[] {
  const keys = new Set<string>();
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[2].trim();
    if (key) keys.add(key);
  }
  return [...keys];
}

/** 文本中是否还存在任何残留占位符 */
export function hasUnresolvedPlaceholders(text: string): boolean {
  return new RegExp(PLACEHOLDER_RE.source).test(text);
}

/**
 * 渲染模板：先处理条件块 `{{#key}}...{{/key}}`，再替换变量 `{{key}}`。
 * 未定义的变量保留原样（以便 `findUnresolvedPlaceholders` 检出）。
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  // 1. 条件块
  const blockRe = /\{\{#([^{}]+?)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let result = template.replace(blockRe, (_m, key: string, body: string) => {
    const v = variables[key.trim()];
    return v !== undefined && v.trim() !== "" ? body : "";
  });

  // 2. 简单变量
  result = result.replace(/\{\{([^{}]+?)\}\}/g, (m, key: string) => {
    const k = key.trim();
    return variables[k] !== undefined ? variables[k] : m;
  });

  return result;
}
