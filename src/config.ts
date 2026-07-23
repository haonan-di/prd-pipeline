/** 配置读写 — prd-config.yaml */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse, stringify } from "yaml";
import type { WorkspaceConfig } from "./types.js";

const CONFIG_FILENAME = "prd-config.yaml";

/** 获取配置文件的默认路径（当前工作目录） */
function getConfigPath(cwd?: string): string {
  return join(cwd || process.cwd(), CONFIG_FILENAME);
}

/** 创建默认配置 */
export function createDefaultConfig(): WorkspaceConfig {
  return {
    version: 1,
    workspace: {
      domain: "",
      soul: "",
      template: "standard",
    },
    document_system: {
      type: "local",
    },
    search: {
      recent_spaces: [],
      recent_keywords: [],
    },
  };
}

/** 读取配置，不存在则返回 null */
export function readConfig(cwd?: string): WorkspaceConfig | null {
  const configPath = getConfigPath(cwd);
  if (!existsSync(configPath)) {
    return null;
  }
  const raw = readFileSync(configPath, "utf-8");
  return parse(raw) as WorkspaceConfig;
}

/** 写入配置 */
export function writeConfig(config: WorkspaceConfig, cwd?: string): string {
  const configPath = getConfigPath(cwd);
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, stringify(config), "utf-8");
  return configPath;
}

/** 检查是否已初始化 */
export function isInitialized(cwd?: string): boolean {
  const config = readConfig(cwd);
  return config !== null && config.workspace.domain !== "";
}
