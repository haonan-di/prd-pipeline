/** config.ts 单元测试 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { createDefaultConfig, readConfig, writeConfig, isInitialized } from "../config.js";

describe("createDefaultConfig", () => {
  it("应该返回正确的默认配置", () => {
    const config = createDefaultConfig();
    expect(config.version).toBe(1);
    expect(config.workspace.domain).toBe("");
    expect(config.workspace.soul).toBe("");
    expect(config.workspace.template).toBe("standard");
    expect(config.document_system.type).toBe("local");
    expect(config.search.recent_spaces).toEqual([]);
    expect(config.search.recent_keywords).toEqual([]);
  });
});

describe("writeConfig + readConfig", () => {
  it("should write and read config", () => {
    const config = createDefaultConfig();
    config.workspace.domain = "fintech";
    config.workspace.soul = "c-end-pm";
    config.document_system.local_path = "D:/obsidian/my_vault";

    const path = writeConfig(config);
    expect(existsSync(path)).toBe(true);

    const read = readConfig();
    expect(read).not.toBeNull();
    expect(read!.workspace.domain).toBe("fintech");
    expect(read!.workspace.soul).toBe("c-end-pm");
    expect(read!.document_system.local_path).toBe("D:/obsidian/my_vault");

    // cleanup
    const { rmSync } = require("node:fs");
    rmSync(path, { force: true });
  });
});

describe("isInitialized", () => {
  it("should return false when no config exists", () => {
    // 确保没有 config 文件
    expect(isInitialized()).toBe(false);
  });
});