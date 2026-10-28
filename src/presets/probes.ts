/**
 * 探针解析（契约 §7.1 / §8.2）
 * - 一般阶段：用该阶段内联的 probes
 * - compliance 阶段：叠加「合规依据源（applies_to 匹配）+ 所选领域预设」的 probes
 */

import { readConfig } from "../config.js";
import { discoverPresets, getPresetByName, loadPresetFile } from "./loader.js";
import {
  StagesPreset,
  CompliancePreset,
  DomainPreset,
  type ProbeT,
  type StageDefT,
} from "../contracts/index.js";

export interface ResolvedStageSet {
  name: string;
  stages: StageDefT[];
}

export function loadStagesSet(name: string, presetDirs: string[]): ResolvedStageSet | null {
  const found = getPresetByName(name, { presetDirs, type: "stages" });
  if (!found || found.type !== "stages") return null;
  const parsed = StagesPreset.safeParse(found.frontmatter);
  if (!parsed.success) return null;
  return { name, stages: parsed.data.stages };
}

/** 合规阶段的探针 = 匹配的合规依据源 + 领域红线 */
export function resolveComplianceProbes(presetDirs: string[]): ProbeT[] {
  const config = readConfig()?.config;
  const productForm = config?.workspace.product_form ?? "c-end";
  const domain = config?.workspace.domain ?? "";
  const probes: ProbeT[] = [];
  const seen = new Set<string>();

  const push = (list: ProbeT[]) => {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      probes.push(p);
    }
  };

  for (const item of discoverPresets({ presetDirs }).filter((p) => p.type === "compliance")) {
    const parsed = loadPresetFile(item.path);
    if (!parsed) continue;
    const cp = CompliancePreset.safeParse(parsed.frontmatter);
    if (!cp.success) continue;
    const a = cp.data.applies_to;
    if (a.product_form && a.product_form !== productForm) continue;
    if (a.domain && a.domain !== domain) continue;
    push(cp.data.probes);
  }

  if (domain !== "") {
    const d = getPresetByName(domain, { presetDirs, type: "domain" });
    if (d && d.type === "domain") {
      const dp = DomainPreset.safeParse(d.frontmatter);
      if (dp.success) push(dp.data.probes);
    }
  }

  return probes;
}

/** 解析某阶段的探针 */
export function resolveStageProbes(stage: StageDefT, presetDirs: string[]): ProbeT[] {
  const isCompliance = stage.id === "compliance" || stage.probe_ref === "compliance";
  const probes = isCompliance ? resolveComplianceProbes(presetDirs) : stage.probes;
  // 填充所属阶段
  return probes.map((p) => ({ ...p, stage: p.stage ?? stage.id }));
}
