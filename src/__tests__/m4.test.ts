/**
 * M4 文档系统协同 —— 本地检索 + 在线检索计划 + 结构化交付单
 *
 * 定位：工具不联网、不持凭证，只把「查什么、怎么发」结构化交给 agent，
 * 由 agent 调用用户声明的文档 MCP 执行。这里锁定的是交接内容本身。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleWorkspaceInit } from "../tools/workspace.js";
import { handleContextSearch } from "../tools/context.js";
import { handlePublish } from "../tools/publish.js";

const parse = (r: any) => JSON.parse(r.content[0].text);

let work: string;
let vault: string;

const initLocal = () =>
  parse(
    handleWorkspaceInit({
      doc_system: "local",
      local_path: vault,
      workspace_root: join(work, ".prd"),
    })
  );

const initConfluence = (extra: Record<string, unknown> = {}) =>
  parse(
    handleWorkspaceInit({
      doc_system: "confluence",
      remote_mcp_server: "confluence-mcp",
      remote_space: "FINT",
      local_path: vault,
      workspace_root: join(work, ".prd"),
      ...extra,
    })
  );

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-m4-"));
  process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
  vault = join(work, "vault");
  mkdirSync(join(vault, "PRD"), { recursive: true });
  writeFileSync(
    join(vault, "PRD", "历史需求.md"),
    "# 收款台改造\n\n本文讨论收款台的分期入口，以及风控校验顺序。\n",
    "utf-8"
  );
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.PRD_PIPELINE_CONFIG;
});

describe("context.search 本地", () => {
  it("doc_system=local 时不产出远程计划", () => {
    initLocal();
    const r = parse(handleContextSearch({ query: "分期入口" }));
    expect(r.ok).toBe(true);
    expect(r.data.total).toBe(1);
    expect(r.data.results[0].title).toBe("收款台改造");
    expect(r.data.remote_plan).toBeNull();
  });

  it("未初始化也能本地检索，并说明没有远程计划", () => {
    const r = parse(handleContextSearch({ query: "分期", dir: vault }));
    expect(r.ok).toBe(true);
    expect(r.data.remote_plan).toBeNull();
    expect(r.data.remote_note).toContain("未声明在线文档系统");
  });

  it("空查询直接拒绝", () => {
    const r = parse(handleContextSearch({ query: "  " }));
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("INVALID_INPUT");
  });
});

describe("context.search 远程计划", () => {
  it("声明 confluence 后产出三条检索任务与 CQL", () => {
    initConfluence();
    const r = parse(handleContextSearch({ query: "分期入口" }));
    const plan = r.data.remote_plan;

    expect(plan).not.toBeNull();
    expect(plan.platform).toBe("confluence");
    expect(plan.mcp_server).toBe("confluence-mcp");
    expect(plan.space).toBe("FINT");
    expect(plan.queries).toHaveLength(3);
    expect(plan.queries.map((q: any) => q.kind)).toEqual(["requirement", "tech", "decision"]);
    expect(plan.queries[0].cql).toContain('space = "FINT"');
    expect(plan.instructions.join("\n")).toContain("confluence-mcp");
    expect(plan.warning).toBeUndefined();
  });

  it("非 confluence 平台不编造 CQL", () => {
    parse(
      handleWorkspaceInit({
        doc_system: "feishu",
        remote_mcp_server: "feishu-mcp",
        remote_space: "PRD",
        local_path: vault,
        workspace_root: join(work, ".prd"),
      })
    );
    const plan = parse(handleContextSearch({ query: "分期" })).data.remote_plan;
    expect(plan.queries[0].cql).toBeUndefined();
  });

  it("platform 是展示名，可写自由文本", () => {
    parse(
      handleWorkspaceInit({
        doc_system: "other",
        remote_platform: "语雀",
        remote_mcp_server: "yuque-mcp",
        remote_space: "产品",
        local_path: vault,
        workspace_root: join(work, ".prd"),
      })
    );
    const plan = parse(handleContextSearch({ query: "分期" })).data.remote_plan;
    expect(plan.platform).toBe("语雀");
    expect(plan.queries[0].cql).toBeUndefined();
  });

  it("CQL 由 type 决定，与 platform 展示名无关", () => {
    parse(
      handleWorkspaceInit({
        doc_system: "confluence",
        remote_platform: "Confluence Cloud",
        remote_mcp_server: "confluence-mcp",
        remote_space: "FINT",
        local_path: vault,
        workspace_root: join(work, ".prd"),
      })
    );
    const plan = parse(handleContextSearch({ query: "分期" })).data.remote_plan;
    expect(plan.platform).toBe("Confluence Cloud");
    expect(plan.queries[0].cql).toContain('space = "FINT"');
  });

  it("scope=remote 不返回本地结果", () => {
    initConfluence();
    const r = parse(handleContextSearch({ query: "分期入口", scope: "remote" }));
    expect(r.data.results).toEqual([]);
    expect(r.data.total).toBe(0);
    expect(r.data.remote_plan).not.toBeNull();
  });

  it("scope=remote 但未声明在线系统 → INVALID_INPUT", () => {
    initLocal();
    const r = parse(handleContextSearch({ query: "分期", scope: "remote" }));
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("INVALID_INPUT");
    expect(r.error.hint).toContain("workspace.init");
  });

  it("声明了在线系统但缺 MCP → 计划可读且带 warning", () => {
    initConfluence({ remote_mcp_server: "" });
    const plan = parse(handleContextSearch({ query: "分期" })).data.remote_plan;
    expect(plan.mcp_server).toBeNull();
    expect(plan.warning).toContain("无法执行");
  });
});

describe("publish 交付单", () => {
  const body = "# 交付\n\n```mermaid\nflowchart TD\n  A-->B\n```\n\n正文。\n";

  it("upsert 语义：先查后建、带稳定 doc_key", () => {
    initConfluence({ remote_parent_page_id: "PAGE-1" });
    const r = parse(handlePublish({ title: "收款台改造", content: body, version: "1.2" }));
    const h = r.data.remote_handoff;

    expect(h.operation).toBe("upsert");
    expect(h.doc_key).toBe("confluence/FINT/收款台改造");
    expect(h.parent_page_id).toBe("PAGE-1");
    expect(h.version).toBe("1.2");
    expect(h.instructions.join("\n")).toContain("先查后建");
    expect(h.checklist.some((c: string) => c.includes("命中同名页面"))).toBe(true);
  });

  it("统计 mermaid 块并提示出图", () => {
    initConfluence();
    const h = parse(handlePublish({ title: "T", content: body })).data.remote_handoff;
    expect(h.assets.mermaid_blocks).toBe(1);
    expect(h.assets.needs_rendering).toBe(true);
    expect(h.instructions.join("\n")).toContain("prd/diagram.build");
  });

  it("无图时不需要渲染", () => {
    initConfluence();
    const h = parse(handlePublish({ title: "T", content: "# 无图\n正文" })).data.remote_handoff;
    expect(h.assets.mermaid_blocks).toBe(0);
    expect(h.assets.needs_rendering).toBe(false);
  });

  it("local_first 同时给出本地文件与交接单", () => {
    initConfluence();
    const r = parse(handlePublish({ title: "双交付", content: body }));
    expect(existsSync(r.data.local.path)).toBe(true);
    expect(r.data.local.path).toContain(join("PRD"));
    expect(r.data.remote_handoff).toBeDefined();
    expect(r.data.message).toContain("已落本地");
  });

  it("缺 MCP 时交接单带 warning", () => {
    initConfluence({ remote_mcp_server: "" });
    const h = parse(handlePublish({ title: "T", content: body })).data.remote_handoff;
    expect(h.warning).toContain("无法执行");
  });
});

describe("init 声明文档系统", () => {
  it("持久化 parent_page_id 并标记 ready", () => {
    const r = initConfluence({ remote_parent_page_id: "PAGE-9" });
    expect(r.data.document_system.remote_parent_page_id).toBe("PAGE-9");
    expect(r.data.document_system.ready).toBe(true);
  });

  it("缺 space 时 ready=false 并给出告警", () => {
    const r = initConfluence({ remote_space: "" });
    expect(r.data.document_system.ready).toBe(false);
    expect(r.data.warnings.join("\n")).toContain("remote_space");
  });

  it("local 模式直接 ready", () => {
    const r = initLocal();
    expect(r.data.document_system.type).toBe("local");
    expect(r.data.document_system.ready).toBe(true);
  });

  it("切换文档系统时同步平台名（避免飞书套用 Confluence 规则）", () => {
    const r = parse(
      handleWorkspaceInit({
        doc_system: "feishu",
        remote_mcp_server: "feishu-mcp",
        remote_space: "PRD",
        local_path: vault,
        workspace_root: join(work, ".prd"),
      })
    );
    expect(r.data.document_system.remote_platform).toBe("feishu");

    const plan = parse(handleContextSearch({ query: "分期" })).data.remote_plan;
    expect(plan.platform).toBe("feishu");
    expect(plan.queries[0].cql).toBeUndefined();
  });

  it("显式 remote_platform 优先于 doc_system（均为枚举值）", () => {
    const r = parse(
      handleWorkspaceInit({
        doc_system: "feishu",
        remote_platform: "notion",
        remote_mcp_server: "feishu-mcp",
        remote_space: "PRD",
        local_path: vault,
        workspace_root: join(work, ".prd"),
      })
    );
    expect(r.data.document_system.remote_platform).toBe("notion");
  });

  it("doc_system=other 保留既有平台名", () => {
    initConfluence();
    const r = parse(
      handleWorkspaceInit({
        doc_system: "other",
        remote_mcp_server: "custom-mcp",
        remote_space: "PRD",
      })
    );
    expect(r.data.document_system.type).toBe("other");
    expect(r.data.document_system.remote_platform).toBe("confluence");
  });
});
