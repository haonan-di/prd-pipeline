/**
 * domain 工具（契约 v3）—— prd/domain.detect
 * 只给建议；切换领域必须由 agent 向用户确认后调用 workspace.init 完成。
 */

import { readConfig } from "../config.js";
import { discoverPresets, loadPresetFile } from "../presets/loader.js";
import { DomainPreset } from "../contracts/index.js";
import { detectDomain, type DomainKeywordSet } from "../presets/domain-detect.js";
import { okResult, failResult } from "../envelope.js";

export const DOMAIN_DETECT_TOOL = {
  name: "prd/domain.detect",
  description:
    "根据需求描述，用各领域预设的 keywords 打分，返回**带证据**的领域切换建议。仅供建议：切换前必须向用户确认，不得静默切换。",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "用户的需求描述（原话或摘要）" },
      min_hits: { type: "number", default: 2, description: "至少命中多少关键词才建议切换" },
    },
    required: ["text"],
  },
} as const;

export function handleDomainDetect(args: Record<string, unknown>) {
  const text = (args.text as string) ?? "";
  if (text.trim() === "") return failResult("INVALID_INPUT", "缺少需求描述 text");

  const config = readConfig()?.config;
  const dirs = config?.preset_dirs ?? [];
  const current = config?.workspace.domain ?? "general";

  const domains: DomainKeywordSet[] = [];
  for (const item of discoverPresets({ presetDirs: dirs }).filter((p) => p.type === "domain")) {
    const parsed = loadPresetFile(item.path);
    if (!parsed) continue;
    const dp = DomainPreset.safeParse(parsed.frontmatter);
    domains.push({ name: item.name, keywords: dp.success ? dp.data.keywords : [] });
  }

  const minHits = (args.min_hits as number) ?? 2;
  return okResult(detectDomain(text, domains, current, minHits));
}
