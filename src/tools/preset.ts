/**
 * preset 工具（契约 §4 B）—— list / get / validate
 * 名字可跨类型重复（如 template/standard 与 stages/standard），故支持 type 限定。
 */

import { readConfig } from "../config.js";
import {
  discoverPresets,
  findPresetsByName,
  getPresetByName,
  loadPresetFile,
} from "../presets/loader.js";
import { Preset, type PresetTypeT } from "../contracts/index.js";
import { okResult, failResult } from "../envelope.js";

const TYPE_ENUM = ["domain", "soul", "template", "compliance", "stages", "diagrams"] as const;

export const PRESET_LIST_TOOL = {
  name: "prd/preset.list",
  description:
    "列出可用预设（六类：domain/soul/template/compliance/stages/diagrams），扫描内置+自定义目录，标注来源。",
  inputSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: TYPE_ENUM as unknown as string[], description: "可选：仅列出某一类" },
    },
  },
} as const;

export const PRESET_GET_TOOL = {
  name: "prd/preset.get",
  description: "按名读取单个预设（含 frontmatter 与正文）。同名跨类型时需用 type 指定。",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      type: { type: "string", enum: TYPE_ENUM as unknown as string[] },
    },
    required: ["name"],
  },
} as const;

export const PRESET_VALIDATE_TOOL = {
  name: "prd/preset.validate",
  description: "校验预设文件结构（frontmatter 必填项与各类型结构），返回具体错误（file/field/message）。",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "按名查找并校验" },
      type: { type: "string", enum: TYPE_ENUM as unknown as string[] },
      path: { type: "string", description: "按路径校验（优先于 name）" },
    },
  },
} as const;

function presetDirs(): string[] {
  return readConfig()?.config.preset_dirs ?? [];
}

export function handlePresetList(args: Record<string, unknown>) {
  const all = discoverPresets({ presetDirs: presetDirs() });
  const type = args.type as string | undefined;
  const presets = type ? all.filter((p) => p.type === type) : all;
  return okResult({ presets });
}

export function handlePresetGet(args: Record<string, unknown>) {
  const name = args.name as string;
  if (!name) return failResult("INVALID_INPUT", "缺少参数 name");
  const type = args.type as PresetTypeT | undefined;

  const items = findPresetsByName(name, { presetDirs: presetDirs(), type });
  if (items.length === 0) {
    return failResult("PRESET_NOT_FOUND", `预设「${name}」不存在`, "用 prd/preset.list 查看可用项");
  }
  if (items.length > 1) {
    return failResult(
      "INVALID_INPUT",
      `名称「${name}」对应多个预设：${items.map((i) => i.type).join(", ")}`,
      "请用 type 指定其一"
    );
  }

  const found = getPresetByName(name, { presetDirs: presetDirs(), type });
  if (!found) return failResult("PRESET_NOT_FOUND", `预设「${name}」读取失败`);
  return okResult({
    name,
    type: found.type,
    source: found.source,
    path: found.path,
    frontmatter: found.frontmatter,
    body: found.body,
  });
}

export function handlePresetValidate(args: Record<string, unknown>) {
  let filePath = args.path as string | undefined;
  const name = args.name as string | undefined;
  const type = args.type as PresetTypeT | undefined;

  if (!filePath && name) {
    const found = getPresetByName(name, { presetDirs: presetDirs(), type });
    if (!found) return failResult("PRESET_NOT_FOUND", `预设「${name}」不存在`);
    filePath = found.path;
  }
  if (!filePath) return failResult("INVALID_INPUT", "需要 name 或 path");

  const parsed = loadPresetFile(filePath);
  if (!parsed) return failResult("PRESET_NOT_FOUND", `文件不存在：${filePath}`);

  const res = Preset.safeParse(parsed.frontmatter);
  const errors = res.success
    ? []
    : res.error.issues.map((i) => ({
        file: filePath as string,
        field: i.path.join(".") || "(root)",
        message: i.message,
      }));

  return okResult({ file: filePath, valid: res.success, errors });
}
