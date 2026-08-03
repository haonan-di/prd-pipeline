/** 配置读写 — prd-config.yaml */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import type { WorkspaceConfig } from "./types.js";

const CONFIG_FILENAME = "prd-config.yaml";

/** 获取项目根目录（相对于此脚本的固定位置） */
function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // config.ts 在 src/ 下，项目根在 src/..
  return join(__dirname, "..");
}

/** 获取配置文件的固定路径（项目根目录） */
function getConfigPath(): string {
  return join(getProjectRoot(), CONFIG_FILENAME);
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
export function readConfig(): WorkspaceConfig | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }
  const raw = readFileSync(configPath, "utf-8");
  return parse(raw) as WorkspaceConfig;
}

/** 写入配置 */
export function writeConfig(config: WorkspaceConfig): string {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, stringify(config), "utf-8");
  return configPath;
}

/** 检查是否已初始化 */
export function isInitialized(): boolean {
  const config = readConfig();
  return config !== null && config.workspace.domain !== "";
}
