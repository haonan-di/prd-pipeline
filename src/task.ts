/**
 * 任务目录与状态（契约 §1.1 / §1.2 / §1.3）
 * 一个需求一个文件夹：<workspace_root>/<slug>/，state.yaml 标记该目录为需求目录。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { TaskState, type TaskStateT } from "./contracts/index.js";
import { assertHostPath } from "./paths.js";

/** 标题 → slug：去非法字符、空白转 -、截断 50，保留中英文（契约 §1.1） */
export function slugify(title: string): string {
  const s = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return s === "" ? "untitled" : s;
}

/** 工作区根：config 指定优先，否则 <cwd>/.prd */
export function resolveWorkspaceRoot(configured: string | undefined): string {
  if (configured && configured.trim() !== "") return configured;
  return join(process.cwd(), ".prd");
}

export function taskDir(root: string, slug: string): string {
  return join(root, slug);
}

export function isTaskDir(dir: string): boolean {
  return existsSync(join(dir, "state.yaml"));
}

export function readState(dir: string): TaskStateT | null {
  const p = join(dir, "state.yaml");
  if (!existsSync(p)) return null;
  return TaskState.parse(parse(readFileSync(p, "utf-8")));
}

export function writeState(dir: string, state: TaskStateT): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.yaml"), stringify(state), "utf-8");
}

/** 列出现有需求 slug（候选集，用于 §7.3 绑定顺序第 2 步） */
export function listTasks(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isTaskDir(join(root, e.name)))
    .map((e) => e.name);
}

export interface EnsureTaskResult {
  slug: string;
  dir: string;
  state: TaskStateT;
  created: boolean;
}

/** 确保需求目录存在（新建时创建 state.yaml） */
export function ensureTask(
  root: string,
  slug: string,
  title: string,
  now: string
): EnsureTaskResult {
  // 生成/落盘的第一道闸：避免把异构平台路径当文件名静默创建
  assertHostPath(root, "workspace_root");
  const dir = taskDir(root, slug);
  const existing = readState(dir);
  if (existing) {
    return { slug, dir, state: existing, created: false };
  }
  const state: TaskStateT = {
    version: 1,
    slug,
    title,
    created: now,
    updated: now,
    stages: { completed: [] },
    versions: [],
  };
  writeState(dir, state);
  return { slug, dir, state, created: true };
}

/** 在任务目录下生成唯一文件名（同版本冲突时追加 -2） */
export function uniqueFilePath(dir: string, filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let candidate = filename;
  let i = 2;
  while (existsSync(join(dir, candidate))) {
    candidate = `${stem}-${i}${ext}`;
    i += 1;
  }
  return join(dir, candidate);
}
