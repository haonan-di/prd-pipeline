/**
 * 工作区就绪判定与工作区根 —— 回归自真实 dogfood 中发现的两个问题：
 *  1) 领域可选，未选领域不应导致 draft
 *  2) workspace_root 未显式给出时应回填实际路径并告警
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleWorkspaceInit, handleWorkspaceStatus } from "../tools/workspace.js";

const parse = (r: any) => JSON.parse(r.content[0].text);

let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-ws-"));
  process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.PRD_PIPELINE_CONFIG;
});

describe("工作区就绪判定", () => {
  it("不指定领域时默认 general，且 ready", () => {
    handleWorkspaceInit({ soul: "c-end-pm" });
    const s = parse(handleWorkspaceStatus());
    expect(s.data.status).toBe("ready");
    expect(s.data.config.workspace.domain).toBe("general");
  });

  it("显式清空领域会被归一为 general", () => {
    handleWorkspaceInit({ domain: "fintech" });
    handleWorkspaceInit({ domain: "" });
    const s = parse(handleWorkspaceStatus());
    expect(s.data.config.workspace.domain).toBe("general");
    expect(s.data.status).toBe("ready");
  });

  it("未显式给 workspace_root → 回填实际路径并告警", () => {
    const r = parse(handleWorkspaceInit({}));
    expect(r.data.workspace_root).not.toBe("");
    expect(r.data.workspace_root).toContain(".prd");
    expect(r.data.warnings.join(" ")).toContain("workspace_root");
  });

  it("未指定交付目录 → 给默认 prd-output 并说明", () => {
    const r = parse(handleWorkspaceInit({}));
    expect(r.data.config.document_system.local.vault_path).toContain("prd-output");
    expect(r.data.defaults_applied.join(" ")).toContain("prd-output");
  });

  it("显式给 workspace_root → 采用且无该告警", () => {
    const custom = join(work, "ws");
    const r = parse(handleWorkspaceInit({ workspace_root: custom }));
    expect(r.data.workspace_root).toBe(custom);
    expect(r.data.warnings.join(" ")).not.toContain("未显式指定 workspace_root");
  });
});
