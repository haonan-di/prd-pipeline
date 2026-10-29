/**
 * C2 / C4 回归 —— 阶段终态与本地检索相关性
 *
 * C2：最后一个阶段保存后 `stages.current` 记为 "done"（显式终态，便于状态判断）
 * C4：本地检索按相关性排序——标题命中 > 路径命中 > 正文多次提及；摘要落在命中密度最高的一行
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleWorkspaceInit } from "../tools/workspace.js";
import { handleDiscussSave } from "../tools/discuss.js";
import { handleContextSearch } from "../tools/context.js";

const parse = (r: any) => JSON.parse(r.content[0].text);

let work: string;
let vault: string;
let root: string;

const init = () =>
  handleWorkspaceInit({
    domain: "general",
    soul: "c-end-pm",
    doc_system: "local",
    local_path: vault,
    workspace_root: root,
  });

const write = (name: string, body: string) => {
  mkdirSync(join(vault, "PRD"), { recursive: true });
  writeFileSync(join(vault, "PRD", name), body, "utf-8");
};

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-c2c4-"));
  process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
  vault = join(work, "vault");
  root = join(work, ".prd");
  mkdirSync(vault, { recursive: true });
  init();
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.PRD_PIPELINE_CONFIG;
});

describe("C2 阶段终态", () => {
  it("最后一个阶段保存 → current=done，next_stage=null", () => {
    const r = parse(handleDiscussSave({ title: "终态", stage: "scope", intent: "I" }));
    expect(r.data.next_stage).toBeNull();
    expect(r.data.stages_done).toBe(true);
    expect(r.data.state.stages.current).toBe("done");
    expect(readFileSync(join(root, "终态", "state.yaml"), "utf-8")).toContain("current: done");
  });

  it("中间阶段 → current 指向下一个阶段", () => {
    const r = parse(handleDiscussSave({ title: "中间", stage: "problem", intent: "I" }));
    expect(r.data.next_stage).toBe("solution");
    expect(r.data.stages_done).toBe(false);
    expect(r.data.state.stages.current).toBe("solution");
  });

  it("未知阶段不误判为完成", () => {
    const r = parse(handleDiscussSave({ title: "未知", stage: "nope", intent: "I" }));
    expect(r.data.next_stage).toBeNull();
    expect(r.data.stages_done).toBe(false);
  });
});

describe("C4 本地检索相关性", () => {
  it("标题命中排在正文命中之前", () => {
    write("a-正文提及.md", "# 无关标题\n\n这段正文顺带提到分期入口一次。\n");
    write("b-标题命中.md", "# 分期入口改造\n\n正文没有重复该词。\n");
    const r = parse(handleContextSearch({ query: "分期入口" }));
    expect(r.data.total).toBe(2);
    expect(r.data.results[0].title).toBe("分期入口改造");
    expect(r.data.results[0].matched_in).toContain("title");
    expect(r.data.results[0].score).toBeGreaterThan(r.data.results[1].score);
    expect(r.data.results[1].matched_in).toEqual(["body"]);
  });

  it("正文多次提及分数高于单次提及", () => {
    write("once.md", "# 甲\n\n风控校验一次。\n");
    write("many.md", "# 乙\n\n风控校验、风控校验、风控校验。\n");
    const r = parse(handleContextSearch({ query: "风控校验" }));
    expect(r.data.results[0].title).toBe("乙");
  });

  it("多词查询要求全部命中（AND 而非 OR）", () => {
    write("only-one.md", "# 甲\n\n只讲分期入口。\n");
    write("both.md", "# 乙\n\n分期入口的风控策略。\n");
    const r = parse(handleContextSearch({ query: "分期 风控" }));
    expect(r.data.total).toBe(1);
    expect(r.data.results[0].title).toBe("乙");
  });

  it("摘要落在命中密度最高的一行", () => {
    write(
      "snippet.md",
      ["# 长文档", "", "第一段与查询无关。", "", "第二段也无关。", "", "这里讲扫码跳转与扫码跳转的差异。", ""].join("\n")
    );
    const r = parse(handleContextSearch({ query: "扫码跳转" }));
    expect(r.data.results[0].snippet).toContain("扫码跳转与扫码跳转");
  });

  it("limit 生效且结果按分数降序", () => {
    write("t1.md", "# 关键词A\n\n正文。\n");
    write("t2.md", "# 关键词B\n\n正文。\n");
    write("t3.md", "# 无关\n\n关键词A 关键词B 关键词A 关键词B 关键词A。\n");
    const r = parse(handleContextSearch({ query: "关键词A", limit: 2 }));
    expect(r.data.results).toHaveLength(2);
    const scores = r.data.results.map((x: any) => x.score);
    expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
    expect(r.data.results[0].title).toBe("关键词A");
  });

  it("大小写不敏感", () => {
    write("case.md", "# App 引导\n\nAPP 引导链路。\n");
    const r = parse(handleContextSearch({ query: "app 引导" }));
    expect(r.data.total).toBe(1);
  });
});
