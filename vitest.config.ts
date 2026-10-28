import { defineConfig } from "vitest/config";

/**
 * 只收集 src 下的测试，排除 dist（编译产物会残留旧文件，若被扫到会跑已删除的旧测试）。
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "dist/**"],
  },
});
