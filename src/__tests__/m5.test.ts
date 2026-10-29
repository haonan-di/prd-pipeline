/**
 * M5 图表工具链 —— 本地渲染与 drawio 引擎
 *
 * 这些用例刻意不依赖真实浏览器：渲染管线里"能从 DOM 里正确取出 SVG"、
 * "拿不到就降级"这类逻辑用纯函数与假路径就能测；真正的截图效果由
 * `scripts/check-diagram.mjs` 在本机跑（有 Edge/Chrome 的环境）。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildMermaidHtml,
  extractRenderError,
  extractSvgFromDom,
  findBrowser,
  browserCandidates,
  mermaidBundleStatus,
} from "../diagram/browser.js";
import { DrawioEngine } from "../diagram/engines/drawio.js";
import { MermaidEngine } from "../diagram/engines/mermaid.js";
import { handleWorkspaceInit } from "../tools/workspace.js";

let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "prd-m5-"));
  delete process.env.PRD_BROWSER_PATH;
  delete process.env.PRD_MERMAID_BUNDLE;
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.PRD_BROWSER_PATH;
  delete process.env.PRD_MERMAID_BUNDLE;
  delete process.env.PRD_PIPELINE_CONFIG;
});

describe("渲染结果解析", () => {
  it("从 dump-dom 输出中取出 svg", () => {
    const dom = `<html><body><div id="x"></div><svg width="10"><circle r="4"/></svg></body></html>`;
    expect(extractSvgFromDom(dom)).toBe(`<svg width="10"><circle r="4"/></svg>`);
  });

  it("多个 svg 取第一个，且不贪婪跨图", () => {
    const dom = `<svg id="a"></svg><svg id="b"></svg>`;
    expect(extractSvgFromDom(dom)).toBe(`<svg id="a"></svg>`);
  });

  it("没有 svg 返回 null", () => {
    expect(extractSvgFromDom("<html><body>空</body></html>")).toBeNull();
  });

  it("识别渲染期错误", () => {
    expect(extractRenderError("<title>PRD_RENDER_OK</title>")).toBeNull();
    expect(extractRenderError("<title>PRD_RENDER_FAIL: Parse error on line 2</title>")).toContain(
      "Parse error"
    );
  });
});

describe("渲染用 HTML", () => {
  it("对图源码做 HTML 转义，避免提前闭合标签", () => {
    const html = buildMermaidHtml("graph TD\n  A[<b>&]-->B", "https://cdn.example/mermaid.js");
    expect(html).toContain("&lt;b&gt;&amp;");
    expect(html).not.toContain("A[<b>&]");
    expect(html).toContain("https://cdn.example/mermaid.js");
  });

  it("保留图源码的换行与中文", () => {
    const html = buildMermaidHtml("flowchart TD\n  A[用户]-->B[订单]", "x.js");
    expect(html).toContain("A[用户]");
    expect(html).toContain("B[订单]");
  });
});

describe("浏览器探测", () => {
  it("按平台列出候选路径", () => {
    const win = browserCandidates("win32");
    expect(win.length).toBeGreaterThanOrEqual(4);
    expect(win.some((p) => p.includes("msedge.exe"))).toBe(true);
    expect(win.some((p) => p.includes("chrome.exe"))).toBe(true);
    expect(browserCandidates("darwin").some((p) => p.includes("Google Chrome.app"))).toBe(true);
    expect(browserCandidates("linux")).toEqual([]);
  });

  it("PRD_BROWSER_PATH 优先于默认路径", () => {
    const fake = join(work, "my-browser");
    writeFileSync(fake, "not really a browser", "utf-8");
    process.env.PRD_BROWSER_PATH = fake;
    const found = findBrowser();
    expect(found?.path).toBe(fake);
  });

  it("PRD_BROWSER_PATH 指向不存在的文件时忽略它", () => {
    process.env.PRD_BROWSER_PATH = join(work, "nope");
    const found = findBrowser();
    expect(found?.path).not.toBe(join(work, "nope"));
  });
});

describe("drawio 引擎", () => {
  const engine = new DrawioEngine();
  const good = `<mxfile><diagram id="d1" name="流程"><mxGraphModel><root/></mxGraphModel></diagram></mxfile>`;

  it("接受 mxfile 与 mxGraphModel", () => {
    expect(engine.validate(good).ok).toBe(true);
    expect(engine.validate(`<mxGraphModel><root/></mxGraphModel>`).ok).toBe(true);
  });

  it("拒绝非 XML / 空源码", () => {
    expect(engine.validate("graph TD; A-->B").ok).toBe(false);
    expect(engine.validate("   ").ok).toBe(false);
  });

  it("source 策略原样返回", async () => {
    const r = await engine.build(good, "source");
    expect(r.strategy_used).toBe("source");
    expect(r.source).toBe(good);
    expect(r.local_path).toBeUndefined();
  });

  it("local 策略落 .drawio 文件并提示如何导出", async () => {
    const outDir = join(work, "assets");
    const r = await engine.build(good, "local", { out_dir: outDir });
    expect(r.strategy_used).toBe("local");
    expect(r.local_path?.endsWith(".drawio")).toBe(true);
    expect(existsSync(r.local_path as string)).toBe(true);
    expect(readFileSync(r.local_path as string, "utf-8")).toBe(good);
    expect(r.warnings.some((w) => w.includes("drawio 中打开"))).toBe(true);
  });

  it("相同源码生成相同文件名（幂等）", async () => {
    const outDir = join(work, "assets");
    const a = await engine.build(good, "local", { out_dir: outDir });
    const b = await engine.build(good, "local", { out_dir: outDir });
    expect(a.local_path).toBe(b.local_path);
  });

  it("不支持的策略抛错", async () => {
    await expect(engine.build(good, "remote")).rejects.toThrow(/不支持/);
  });
});

describe("mermaid 本地渲染降级", () => {
  it("声明支持 local 策略", () => {
    expect(new MermaidEngine().strategies).toContain("local");
  });

  it("浏览器不可执行时降级为 source 并说明原因", async () => {
    // 指向一个存在但不是可执行程序的文件：execFile 必然失败
    const fake = join(work, "broken-browser");
    writeFileSync(fake, "not executable", "utf-8");
    process.env.PRD_BROWSER_PATH = fake;

    const engine = new MermaidEngine();
    const r = await engine.build("graph TD\n  A-->B", "local", {
      format: "svg",
      out_dir: join(work, "assets"),
    });

    expect(r.strategy_used).toBe("source");
    expect(r.local_path).toBeUndefined();
    expect(r.warnings.join("\n")).toContain("本地渲染失败");
  });
});

describe("图表能力自检", () => {
  it("PRD_MERMAID_BUNDLE 指定的文件存在时视为可用", () => {
    const bundle = join(work, "mermaid.min.js");
    writeFileSync(bundle, "// stub", "utf-8");
    process.env.PRD_MERMAID_BUNDLE = bundle;
    const st = mermaidBundleStatus();
    expect(st.available).toBe(true);
    expect(st.source).toBe("env");
  });

  it("未提供 bundle 时来源为 package 或 cdn", () => {
    const st = mermaidBundleStatus();
    if (st.available) expect(["package", "env"]).toContain(st.source);
    else expect(st.source).toBe("cdn");
  });

  it("init 返回图表能力，供 agent 提前告知用户", () => {
    process.env.PRD_PIPELINE_CONFIG = join(work, "prd-config.yaml");
    const r = JSON.parse(
      handleWorkspaceInit({
        local_path: join(work, "vault"),
        workspace_root: join(work, ".prd"),
      }).content[0].text
    );
    expect(r.data.capabilities.diagram).toHaveProperty("local_render_ready");
    expect(r.data.capabilities.diagram).toHaveProperty("browser");
    expect(r.data.capabilities.diagram).toHaveProperty("mermaid_bundle");
  });
});
