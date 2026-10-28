/**
 * config 读写（契约 §2）—— 固定在项目根，或由 PRD_PIPELINE_CONFIG 覆盖。
 * 读取时自动迁移 v1/v2 → v3。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import { migrateToV3, type WorkspaceConfigV3T } from "./contracts/index.js";

const CONFIG_FILENAME = "prd-config.yaml";

export function resolveConfigPath(): string {
  const env = process.env.PRD_PIPELINE_CONFIG;
  if (env && env.trim() !== "") return env;
  return join(process.cwd(), CONFIG_FILENAME);
}

export interface LoadedConfig {
  config: WorkspaceConfigV3T;
  migrated: boolean;
  path: string;
}

export function readConfig(): LoadedConfig | null {
  const path = resolveConfigPath();
  if (!existsSync(path)) return null;
  const raw = parse(readFileSync(path, "utf-8"));
  const { config, migrated } = migrateToV3(raw);
  return { config, migrated, path };
}

export function writeConfig(config: WorkspaceConfigV3T): string {
  const path = resolveConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, stringify(config), "utf-8");
  return path;
}

export type WorkspaceStatus = "ready" | "draft" | "uninitialized";

/**
 * 就绪状态只取决于：配置是否存在 + 是否标记为 active。
 * 领域（domain）等预设是**可选**的，不参与就绪判定（避免"没选领域就永远 draft"）。
 */
export function getWorkspaceStatus(): WorkspaceStatus {
  const loaded = readConfig();
  if (!loaded) return "uninitialized";
  return loaded.config.status === "draft" ? "draft" : "ready";
}
