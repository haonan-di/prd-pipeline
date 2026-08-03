/** writer.ts 单元测试 */

import { describe, it, expect } from "vitest";
import { renderTemplate, generatePrdFilename } from "../writer.js";

describe("renderTemplate", () => {
  it("应该替换简单变量", () => {
    const result = renderTemplate("Hello {name}", { name: "World" });
    expect(result).toBe("Hello World");
  });

  it("应该替换中文变量名", () => {
    const result = renderTemplate("# {需求名称}", { "需求名称": "测试需求" });
    expect(result).toBe("# 测试需求");
  });

  it("应该替换多个变量", () => {
    const template = "# {title}\n\n**作者:** {author}\n**日期:** {date}";
    const result = renderTemplate(template, {
      title: "测试PRD",
      author: "张三",
      date: "2026-07-24",
    });
    expect(result).toContain("# 测试PRD");
    expect(result).toContain("**作者:** 张三");
    expect(result).toContain("**日期:** 2026-07-24");
  });

  it("未定义的变量应该保留原样", () => {
    const result = renderTemplate("Hello {undefined_var}", {});
    expect(result).toBe("Hello {undefined_var}");
  });

  it("条件块：变量有值时应保留内容", () => {
    const template = "前缀 {#optional}这里有内容{/optional} 后缀";
    const result = renderTemplate(template, { optional: "有值" });
    expect(result).toBe("前缀 这里有内容 后缀");
  });

  it("条件块：变量为空时应移除整个块", () => {
    const template = "前缀 {#empty}这些内容应该被移除{/empty} 后缀";
    const result = renderTemplate(template, { empty: "" });
    expect(result).toBe("前缀  后缀");
  });

  it("条件块：变量不存在时应移除整个块", () => {
    const template = "前缀 {#optional}可选内容{/optional} 后缀";
    const result = renderTemplate(template, {});
    expect(result).toContain("前缀");
    expect(result).toContain("后缀");
    expect(result).not.toContain("可选内容");
  });

  it("多行条件块应该正确处理", () => {
    const template = "开始\n{#has_section}\n## 章节标题\n章节内容\n{/has_section}\n结束";
    const result = renderTemplate(template, { has_section: "yes" });
    expect(result).toContain("## 章节标题");
    expect(result).not.toContain("{#has_section}");
    expect(result).not.toContain("{/has_section}");
  });

  it("应该正确处理 PRD 模板风格变量", () => {
    const template = "# {需求名称}\n\n| 版本 | 时间 |\n|------|------|\n| v{版本号} | {日期} |";
    const result = renderTemplate(template, {
      "需求名称": "用户登录优化",
      "版本号": "2.0",
      "日期": "2026-07-24",
    });
    expect(result).toContain("# 用户登录优化");
    expect(result).toContain("v2.0");
    expect(result).toContain("2026-07-24");
  });
});

describe("generatePrdFilename", () => {
  it("应该生成带日期的文件名", () => {
    const filename = generatePrdFilename("用户登录优化");
    expect(filename).toMatch(/^\d{8}-用户登录优化\.md$/);
  });

  it("应该移除标题中的非法字符", () => {
    const filename = generatePrdFilename("测试: 需求<详细>说明?");
    expect(filename).not.toContain(":");
    expect(filename).not.toContain("<");
    expect(filename).not.toContain(">");
    expect(filename).not.toContain("?");
  });

  it("应该将空格替换为连字符", () => {
    const filename = generatePrdFilename("User Login Optimization");
    expect(filename).toContain("User-Login-Optimization");
  });

  it("带版本号应包含版本后缀", () => {
    const filename = generatePrdFilename("测试需求", "1.2");
    expect(filename).toMatch(/-v1\.2\.md$/);
  });

  it("标题超过 50 字符应截断", () => {
    const longTitle = "A".repeat(60);
    const filename = generatePrdFilename(longTitle);
    const namePart = filename.replace(/^\d{8}-/, "").replace(/\.md$/, "");
    expect(namePart.length).toBeLessThanOrEqual(50);
  });
});
