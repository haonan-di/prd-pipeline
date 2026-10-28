/**
 * 预设加载（契约 §3）—— 扫描内置 + 自定义目录，解析 Markdown + YAML frontmatter。
 * 覆盖规则：同名（type+name）自定义覆盖内置。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { PresetListItemT, PresetTypeT } from "../contracts/index.js";
import { PresetType } from "../contracts/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BUILTIN_PRESETS_DIR = join(__dirname, "..", "..", "presets");

export interface ParsedPreset {
  frontmatter: Record<string, unknown>;
  body: string;
  path: string;
}

/** 六类预设各自的目录名 */
export const TYPE_DIR: Record<PresetTypeT, string> = {
  domain: "domains",
  soul: "souls",
  template: "templates",
  compliance: "compliance",
  stages: "stages",
  diagrams: "diagrams",
};

/** 解析 `--- yaml ---` frontmatter */
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { frontmatter: {}, body: raw };
  const fm = (parseYaml(m[1]) ?? {}) as Record<string, unknown>;
  return { frontmatter: fm, body: raw.slice(m[0].length) };
}

export function loadPresetFile(path: string): ParsedPreset | null {
  if (!existsSync(path)) return null;
  const { frontmatter, body } = parseFrontmatter(readFileSync(path, "utf-8"));
  return { frontmatter, body, path };
}

export interface DiscoverOptions {
  presetDirs?: string[];
  /** 限定预设类型（同名跨类型时必需，如 template/standard 与 stages/standard） */
  type?: PresetTypeT;
}

/** 扫描内置 + 自定义，返回可选项（自定义覆盖内置，保留插入顺序） */
export function discoverPresets(opts: DiscoverOptions = {}): PresetListItemT[] {
  const roots: { root: string; source: "builtin" | "custom" }[] = [
    { root: BUILTIN_PRESETS_DIR, source: "builtin" },
    ...(opts.presetDirs ?? []).map((d) => ({ root: d, source: "custom" as const })),
  ];

  const map = new Map<string, PresetListItemT>();
  const types = Object.keys(TYPE_DIR) as PresetTypeT[];

  for (const { root, source } of roots) {
    for (const type of types) {
      const dir = join(root, TYPE_DIR[type]);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (extname(f) !== ".md") continue;
        if (f.startsWith("_")) continue; // 跳过 _template.md 等样板
        const path = join(dir, f);
        const { frontmatter } = parseFrontmatter(readFileSync(path, "utf-8"));
        const name = (frontmatter.name as string) || basename(f, ".md");
        const key = `${type}/${name}`;
        map.set(key, {
          type,
          name,
          description: (frontmatter.description as string) ?? "",
          source,
          path,
        });
      }
    }
  }

  return [...map.values()];
}

/** 按名查找所有匹配项（可限定类型） */
export function findPresetsByName(
  name: string,
  opts: DiscoverOptions = {}
): PresetListItemT[] {
  return discoverPresets(opts).filter(
    (i) => i.name === name && (opts.type === undefined || i.type === opts.type)
  );
}

/** 读取单个预设（含正文），自动识别类型目录；同名时优先 custom */
export function getPresetByName(
  name: string,
  opts: DiscoverOptions = {}
): (ParsedPreset & { type: PresetTypeT; source: "builtin" | "custom" }) | null {
  const items = findPresetsByName(name, opts);
  if (items.length === 0) return null;
  const chosen = [...items].reverse().find((i) => i.source === "custom") ?? items[0];
  const parsed = loadPresetFile(chosen.path);
  if (!parsed) return null;
  return { ...parsed, type: chosen.type, source: chosen.source };
}

export { PresetType };
