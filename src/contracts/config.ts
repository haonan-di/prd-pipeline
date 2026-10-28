/**
 * 契约：config v3 与任务状态
 * 配套 docs/CONTRACTS.md §1.3 / §2（全局契约，M0 冻结）
 */

import { z } from "zod";
import { DocSystemType, DeliveryMode, ProductForm, ConfigStatus } from "./common.js";

/* ───────────────────────── config v3 ───────────────────────── */

export const LocalDocConfig = z.object({
  vault_path: z.string().default(""),
  subdir: z.string().default("PRD"),
});

export const RemoteDocConfig = z.object({
  platform: DocSystemType.default("confluence"),
  mcp_server: z.string().default(""),
  space: z.string().default(""),
  parent_page_id: z.string().default(""),
  sync_note: z.string().default(""),
});

export const DocumentSystemConfig = z.object({
  type: DocSystemType.default("local"),
  mode: DeliveryMode.default("local_first"),
  local: LocalDocConfig.default({}),
  remote: RemoteDocConfig.default({}),
});

export const DiagramConfig = z.object({
  default_engine: z.string().default("mermaid"),
  render: z.enum(["source", "local", "ask", "remote"]).default("ask"),
  engines: z.array(z.string()).default([]),
});

export const WorkspaceSection = z.object({
  domain: z.string().default("general"),
  product_form: ProductForm.default("c-end"),
  soul: z.string().default(""),
  template: z.string().default("standard"),
  stages: z.string().default("standard"),
});

export const SearchSection = z.object({
  recent_keywords: z.array(z.string()).default([]),
});

export const WorkspaceConfigV3 = z.object({
  version: z.literal(3),
  status: ConfigStatus.default("active"),
  workspace: WorkspaceSection.default({}),
  document_system: DocumentSystemConfig.default({}),
  diagram: DiagramConfig.default({}),
  preset_dirs: z.array(z.string()).default([]),
  workspace_root: z.string().default(""),
  search: SearchSection.default({}),
});

export type WorkspaceConfigV3T = z.infer<typeof WorkspaceConfigV3>;

/**
 * 迁移 v1/v2 → v3（契约 §2.3）。纯函数，不读盘；调用方负责回写。
 * 返回 `migrated=true` 表示发生了结构迁移。
 */
export function migrateToV3(raw: unknown): { config: WorkspaceConfigV3T; migrated: boolean } {
  const r = (raw ?? {}) as Record<string, any>;
  const alreadyV3 = r.version === 3;

  const ds = (r.document_system ?? {}) as Record<string, any>;
  const ws = (r.workspace ?? {}) as Record<string, any>;
  const dg = (r.diagram ?? {}) as Record<string, any>;
  const localIn = (ds.local ?? {}) as Record<string, any>;
  const remoteIn = (ds.remote ?? {}) as Record<string, any>;

  const candidate = {
    version: 3,
    status: r.status ?? "active",
    workspace: {
      // 领域始终有值：缺省/空值统一归一为 "general"（显式优先于隐式）
      domain: ws.domain || "general",
      product_form: ws.product_form ?? "c-end",
      soul: ws.soul ?? "",
      template: ws.template ?? "standard",
      stages: ws.stages ?? "standard",
    },
    document_system: {
      type: ds.type ?? "local",
      mode: ds.mode ?? "local_first",
      local: {
        // v1/v2 扁平字段 → v3 分区
        vault_path: localIn.vault_path ?? ds.local_path ?? "",
        subdir: localIn.subdir ?? "PRD",
      },
      remote: {
        platform:
          remoteIn.platform ?? (ds.type && ds.type !== "local" ? ds.type : "confluence"),
        mcp_server: remoteIn.mcp_server ?? ds.mcp_server ?? "",
        space: remoteIn.space ?? ds.space ?? "",
        parent_page_id: remoteIn.parent_page_id ?? ds.parent_page_id ?? "",
        sync_note: remoteIn.sync_note ?? "",
      },
    },
    diagram: {
      default_engine: dg.default_engine ?? "mermaid",
      render: dg.render ?? "ask",
      engines: Array.isArray(dg.engines) ? dg.engines : [],
    },
    preset_dirs: Array.isArray(r.preset_dirs) ? r.preset_dirs : [],
    workspace_root: r.workspace_root ?? "",
    search: {
      recent_keywords: Array.isArray(r.search?.recent_keywords) ? r.search.recent_keywords : [],
    },
  };

  const config = WorkspaceConfigV3.parse(candidate);
  return { config, migrated: !alreadyV3 };
}

/* ───────────────────────── 任务状态 state.yaml ───────────────────────── */

export const TaskStageProgress = z.object({
  completed: z.array(z.string()).default([]),
  current: z.string().optional(),
});

/** 历史版本条目（用于累积 PRD 修订记录） */
export const TaskVersionEntry = z.object({
  version: z.string(),
  date: z.string(),
  changelog: z.string().default(""),
  author: z.string().default(""),
});

export const TaskState = z.object({
  version: z.literal(1).default(1),
  slug: z.string(),
  title: z.string(),
  created: z.string(),
  updated: z.string(),
  stages: TaskStageProgress.default({}),
  current_prd_version: z.string().optional(),
  /** 全部历史版本（按加入顺序）；再次生成同版本时覆盖该条 */
  versions: z.array(TaskVersionEntry).default([]),
});

export type TaskStateT = z.infer<typeof TaskState>;
export type TaskVersionEntryT = z.infer<typeof TaskVersionEntry>;
