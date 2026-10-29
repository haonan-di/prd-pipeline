/**
 * discuss 工具（契约 §4 D / §7）—— 阶段集驱动的结构化讨论
 */

import { existsSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config.js";
import { HostPathError } from "../paths.js";
import { loadStagesSet, resolveStageProbes } from "../presets/probes.js";
import {
  resolveWorkspaceRoot,
  slugify,
  ensureTask,
  taskDir,
  writeState,
} from "../task.js";
import { okResult, failResult } from "../envelope.js";

export const DISCUSS_STAGES_TOOL = {
  name: "prd/discuss.stages",
  description: "返回当前生效的讨论阶段集（来自 config.workspace.stages 预设）。阶段集可自定义替换。",
  inputSchema: {
    type: "object",
    properties: { stages: { type: "string", description: "覆盖阶段集名" } },
  },
} as const;

export const DISCUSS_PROBE_TOOL = {
  name: "prd/discuss.probe",
  description:
    "返回某阶段的探针（每条含 2–3 典型选项 + 推荐 + 理由）。合规阶段自动叠加「合规依据源 + 领域红线」。",
  inputSchema: {
    type: "object",
    properties: {
      stage: { type: "string", description: "阶段 id，如 problem / solution / compliance" },
      stages: { type: "string", description: "覆盖阶段集名" },
    },
    required: ["stage"],
  },
} as const;

export const DISCUSS_SAVE_TOOL = {
  name: "prd/discuss.save",
  description:
    "把某阶段讨论结论追加写入 <任务>/discussion-<stage>.md，并更新 state.yaml 的阶段进度。",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      slug: { type: "string" },
      stage: { type: "string" },
      intent: { type: "string", description: "该阶段意图" },
      constraints: { type: "string", description: "约束" },
      decisions: { type: "string", description: "关键决策" },
      assumptions: { type: "string", description: "暴露的假设" },
      open_questions: { type: "string", description: "遗留问题" },
      workspace_root: { type: "string" },
    },
    required: ["title", "stage"],
  },
} as const;

function presetDirs(): string[] {
  return readConfig()?.config.preset_dirs ?? [];
}

function activeStagesName(override?: string): string {
  return override || readConfig()?.config.workspace.stages || "standard";
}

export function handleDiscussStages(args: Record<string, unknown>) {
  const name = activeStagesName(args.stages as string);
  const set = loadStagesSet(name, presetDirs());
  if (!set) {
    return failResult("PRESET_NOT_FOUND", `阶段集「${name}」不存在或结构非法`, "用 prd/preset.list?type=stages 查看");
  }
  return okResult({
    name: set.name,
    stages: set.stages.map((s) => ({
      id: s.id,
      title: s.title,
      goal: s.goal,
      probe_count: s.probes.length,
      stacked: s.id === "compliance" || s.probe_ref === "compliance",
    })),
  });
}

export function handleDiscussProbe(args: Record<string, unknown>) {
  const stageId = args.stage as string;
  if (!stageId) return failResult("INVALID_INPUT", "缺少 stage");

  const name = activeStagesName(args.stages as string);
  const set = loadStagesSet(name, presetDirs());
  if (!set) return failResult("PRESET_NOT_FOUND", `阶段集「${name}」不存在或结构非法`);

  const stage = set.stages.find((s) => s.id === stageId);
  if (!stage) {
    return failResult(
      "INVALID_INPUT",
      `阶段「${stageId}」不在阶段集 ${name} 中`,
      `可用阶段：${set.stages.map((s) => s.id).join(", ")}`
    );
  }

  const probes = resolveStageProbes(stage, presetDirs());
  return okResult({ stage: stage.id, title: stage.title, goal: stage.goal, probes });
}

export function handleDiscussSave(args: Record<string, unknown>) {
  try {
    const title = args.title as string;
    const stage = args.stage as string;
    if (!title || !stage) return failResult("INVALID_INPUT", "缺少 title 或 stage");

    const config = readConfig()?.config;
    const root = resolveWorkspaceRoot((args.workspace_root as string) || config?.workspace_root);
    const slug = (args.slug as string) || slugify(title);
    const date = new Date().toISOString().slice(0, 10);
    const task = ensureTask(root, slug, title, date);
    const dir = taskDir(root, slug);

    const block = [
      `## ${stage}`,
      "",
      "### Intent",
      (args.intent as string) || "（未填写）",
      "",
      "### Constraints",
      (args.constraints as string) || "（未填写）",
      "",
      "### Key decisions",
      (args.decisions as string) || "（未填写）",
      "",
      "### Surfaced assumptions",
      (args.assumptions as string) || "（未填写）",
      "",
      "### Open questions",
      (args.open_questions as string) || "（未填写）",
      "",
    ].join("\n");

    const file = join(dir, `discussion-${stage}.md`);
    if (existsSync(file)) {
      appendFileSync(file, `\n---\n\n${block}`, "utf-8");
    } else {
      writeFileSync(file, `# 讨论记录\n\n${block}`, "utf-8");
    }

    // 更新阶段进度
    // 最后一个阶段保存后 current 记为 "done"——显式终态而不是把字段删掉，
    // 让「全部讨论完毕」可以被状态判断，而不是靠 completed.length 去猜。
    // 注意区分两种"没有下一个"：走到阶段集末尾（done）vs 阶段名不在阶段集里（保持原进度）。
    const set = loadStagesSet(config?.workspace.stages || "standard", presetDirs());
    const stages = set?.stages ?? [];
    const idx = stages.findIndex((s) => s.id === stage);
    const known = idx >= 0;
    const next = known ? stages[idx + 1]?.id : undefined;
    const atEnd = known && next === undefined;
    const completed = task.state.stages.completed.includes(stage)
      ? task.state.stages.completed
      : [...task.state.stages.completed, stage];
    const state = {
      ...task.state,
      updated: date,
      stages: {
        completed,
        current: atEnd ? "done" : next ?? task.state.stages.current ?? stage,
      },
    };
    writeState(dir, state);

    return okResult({ file, slug, stage, next_stage: next ?? null, stages_done: atEnd, state });
  } catch (error) {
    if (error instanceof HostPathError) {
      return failResult(
        "INVALID_INPUT",
        error.message,
        "检查 config.workspace_root 是否为运行 server 的机器上的有效路径（跨平台路径会被拒绝）"
      );
    }
    return failResult("IO_ERROR", `落盘失败：${String(error)}`);
  }
}
