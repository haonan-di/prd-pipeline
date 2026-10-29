/**
 * 预设校验（M3）—— 结构校验 + 一致性校验
 *
 * zod schema 只能保证"字段齐全且类型对"，但做自定义预设时真正卡人的是这些：
 *   · 文件放错目录（domains/ 下放了 type: soul）
 *   · 文件名与 name 不一致，导致按名查找和按文件排查时对不上
 *   · 模板声明的占位符正文里没用，或正文用了没声明的占位符（generate 会直接失败）
 *   · 阶段 id / 探针 id / 引擎名重复
 *   · 图表引擎声明了 remote 却没给 remote_url
 *
 * 这里把它们显式化，让社区分享预设时能自查，而不是等到运行时才报错。
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { Preset, type PresetTypeT } from "../contracts/index.js";
import { loadPresetFile, TYPE_DIR } from "./loader.js";

export interface Issue {
  file: string;
  field: string;
  message: string;
}

export interface PresetValidationResult {
  file: string;
  type?: PresetTypeT;
  valid: boolean;
  errors: Issue[];
  warnings: Issue[];
}

export interface DirValidationResult {
  dir: string;
  scanned: number;
  valid: boolean;
  files: PresetValidationResult[];
  errors: Issue[];
  warnings: Issue[];
}

/** 从路径反推期望的类型（父目录名 → 类型） */
function typeFromDir(path: string): PresetTypeT | null {
  const parent = basename(dirname(path));
  for (const [type, dir] of Object.entries(TYPE_DIR)) {
    if (dir === parent) return type as PresetTypeT;
  }
  return null;
}

/** 提取正文里用到的占位符键（含条件块 {{#key}}） */
function placeholderKeysIn(body: string): Set<string> {
  const keys = new Set<string>();
  const re = /\{\{\s*[#/]?([^{}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) keys.add(m[1].trim());
  return keys;
}

/**
 * generate 内置注入的变量，不需要在 placeholders 里声明。
 * 与 src/tools/generate.ts 的 variables 保持一致。
 */
const IMPLICIT_VARIABLES = new Set([
  "title",
  "version",
  "date",
  "changelog",
  "changelog_table",
  "author",
]);

export function validatePresetFile(path: string): PresetValidationResult {
  const result: PresetValidationResult = { file: path, valid: true, errors: [], warnings: [] };
  const push = (list: Issue[], field: string, message: string) =>
    list.push({ file: path, field, message });

  const parsed = loadPresetFile(path);
  if (!parsed) {
    push(result.errors, "(file)", "文件不存在或无法读取");
    result.valid = false;
    return result;
  }

  const schema = Preset.safeParse(parsed.frontmatter);
  if (!schema.success) {
    for (const issue of schema.error.issues) {
      push(result.errors, issue.path.join(".") || "(root)", issue.message);
    }
    result.valid = false;
    return result; // 结构都不对，后面的语义检查没有意义
  }

  const preset = schema.data;
  result.type = preset.type;

  // 1) 目录归属
  const dirType = typeFromDir(path);
  if (dirType === null) {
    push(
      result.warnings,
      "(path)",
      `不在六类预设目录内（${Object.values(TYPE_DIR).join(" / ")}），只能按 path 校验`
    );
  } else if (dirType !== preset.type) {
    push(
      result.errors,
      "type",
      `文件位于 ${TYPE_DIR[dirType]}/ 目录，但声明 type: ${preset.type}；应放到 ${TYPE_DIR[preset.type]}/`
    );
    result.valid = false;
  }

  // 2) 文件名与 name 一致
  const stem = basename(path, extname(path));
  if (!stem.startsWith("_") && stem !== preset.name) {
    push(result.warnings, "name", `name「${preset.name}」与文件名「${stem}」不一致，按文件名排查时会找不到`);
  }

  // 3) 正文
  if (parsed.body.trim() === "") {
    push(result.warnings, "(body)", "正文为空；除 template 外的类型通常需要正文承载知识");
  }

  // 4) 类型特定检查
  if (preset.type === "template") {
    const declared = new Set(preset.placeholders.map((p) => p.key));
    const used = placeholderKeysIn(parsed.body);

    for (const key of used) {
      if (IMPLICIT_VARIABLES.has(key)) continue;
      if (!declared.has(key)) {
        push(result.errors, `placeholders.${key}`, `正文使用了 {{${key}}}，但未在 placeholders 中声明`);
        result.valid = false;
      }
    }
    for (const key of declared) {
      if (!used.has(key)) {
        push(result.warnings, `placeholders.${key}`, `声明了 ${key}，但正文没有引用 {{${key}}}`);
      }
    }
    const keys = preset.placeholders.map((p) => p.key);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dup.length > 0) {
      push(result.errors, "placeholders", `占位符键重复：${[...new Set(dup)].join(", ")}`);
      result.valid = false;
    }
  }

  if (preset.type === "stages") {
    if (preset.stages.length === 0) {
      push(result.errors, "stages", "至少需要一个阶段");
      result.valid = false;
    }
    const ids = preset.stages.map((s) => s.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length > 0) {
      push(result.errors, "stages.id", `阶段 id 重复：${[...new Set(dup)].join(", ")}`);
      result.valid = false;
    }
    for (const stage of preset.stages) {
      if (stage.probe_ref !== undefined && stage.probe_ref !== "compliance") {
        push(
          result.warnings,
          `stages.${stage.id}.probe_ref`,
          `未知的 probe_ref「${stage.probe_ref}」；目前只支持 compliance（自动叠加合规依据源 + 领域红线）`
        );
      }
      const probeIds = stage.probes.map((p) => p.id);
      const pdup = probeIds.filter((id, i) => probeIds.indexOf(id) !== i);
      if (pdup.length > 0) {
        push(result.errors, `stages.${stage.id}.probes.id`, `探针 id 重复：${[...new Set(pdup)].join(", ")}`);
        result.valid = false;
      }
    }
  }

  if (preset.type === "diagrams") {
    if (preset.engines.length === 0) {
      push(result.errors, "engines", "至少声明一个引擎");
      result.valid = false;
    }
    const names = preset.engines.map((e) => e.name);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    if (dup.length > 0) {
      push(result.errors, "engines.name", `引擎名重复：${[...new Set(dup)].join(", ")}`);
      result.valid = false;
    }
    for (const engine of preset.engines) {
      if (engine.strategies.includes("remote")) {
        const remoteUrl = (engine.options as Record<string, unknown> | undefined)?.remote_url;
        if (typeof remoteUrl !== "string" || remoteUrl.trim() === "") {
          push(
            result.errors,
            `engines.${engine.name}.options.remote_url`,
            "声明了 remote 策略但没有 remote_url，出图时会失败"
          );
          result.valid = false;
        }
      }
    }
  }

  if (preset.type === "domain") {
    const short = preset.keywords.filter((k) => k.trim().length < 2);
    if (short.length > 0) {
      push(
        result.warnings,
        "keywords",
        `以下关键词长度 < 2，domain.detect 会忽略：${short.join("、")}`
      );
    }
  }

  return result;
}

/** 批量校验一个目录：递归六类子目录，跳过 _ 开头的样板文件 */
export function validatePresetDir(dir: string): DirValidationResult {
  const out: DirValidationResult = {
    dir,
    scanned: 0,
    valid: true,
    files: [],
    errors: [],
    warnings: [],
  };

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    out.valid = false;
    out.errors.push({ file: dir, field: "(dir)", message: "目录不存在" });
    return out;
  }

  for (const [type, sub] of Object.entries(TYPE_DIR)) {
    const full = join(dir, sub);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full)) {
      if (extname(f) !== ".md") continue;
      if (f.startsWith("_")) continue;
      const res = validatePresetFile(join(full, f));
      out.files.push(res);
      out.scanned += 1;
      out.errors.push(...res.errors);
      out.warnings.push(...res.warnings);
      if (!res.valid) out.valid = false;
      void type;
    }
  }

  if (out.scanned === 0) {
    out.warnings.push({
      file: dir,
      field: "(dir)",
      message: `目录下没有找到任何预设（期望 ${Object.values(TYPE_DIR).join(" / ")} 子目录）`,
    });
  }

  return out;
}
