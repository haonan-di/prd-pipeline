/**
 * 本地出图（M5）—— 用无头浏览器把 mermaid 渲成 SVG/PNG。
 *
 * 为什么不是 mermaid.ink：remote 策略会把图内容发给第三方。本地渲染只在本机
 * 跑一个无头浏览器，图内容不出机器；唯一的外部请求是加载 mermaid 脚本本身
 * （若本机未安装 mermaid 包，会退回 CDN，此时会给出 warning 明确说明）。
 *
 * 浏览器的查找顺序：环境变量 PRD_BROWSER_PATH → 平台默认安装位置 → PATH 中的常见命令。
 * 找不到时返回 null，由调用方降级为 source（不阻断流程）。
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export interface BrowserInfo {
  path: string;
  kind: "edge" | "chrome" | "chromium" | "other";
}

const WIN_CANDIDATES: { path: string; kind: BrowserInfo["kind"] }[] = [
  { path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", kind: "edge" },
  { path: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", kind: "edge" },
  { path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", kind: "chrome" },
  { path: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", kind: "chrome" },
];

const DARWIN_CANDIDATES: { path: string; kind: BrowserInfo["kind"] }[] = [
  { path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", kind: "chrome" },
  { path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", kind: "edge" },
  { path: "/Applications/Chromium.app/Contents/MacOS/Chromium", kind: "chromium" },
];

const POSIX_COMMANDS = ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"];

function which(cmd: string): string | null {
  try {
    const out = execFileSync(process.platform === "win32" ? "where.exe" : "which", [cmd], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

/** 查找可用的无头浏览器；platform 参数仅用于测试注入 */
export function findBrowser(platform: string = process.platform): BrowserInfo | null {
  const override = process.env.PRD_BROWSER_PATH;
  if (override && existsSync(override)) {
    return { path: override, kind: "other" };
  }

  const candidates = platform === "win32" ? WIN_CANDIDATES : platform === "darwin" ? DARWIN_CANDIDATES : [];
  for (const c of candidates) {
    if (existsSync(c.path)) return c;
  }

  if (platform !== "win32") {
    for (const cmd of POSIX_COMMANDS) {
      const found = which(cmd);
      if (found) return { path: found, kind: cmd.includes("chrom") ? "chromium" : "other" };
    }
  }

  return null;
}

/** mermaid 脚本来源：优先本机安装的包，其次 CDN（会有 warning） */
export function resolveMermaidSource(): { src: string; external: boolean } {
  const status = mermaidBundleStatus();
  return status.available
    ? { src: pathToFileURL(status.path as string).href, external: false }
    : { src: "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js", external: true };
}

export interface MermaidBundleStatus {
  available: boolean;
  source: "env" | "package" | "cdn";
  path?: string;
}

/**
 * 本机是否有可用的 mermaid 脚本（离线渲染的前提）。
 * init 与 diagram.build 都会用到它，用来在"要联网"这件事上提前告知，而不是等渲染失败。
 */
export function mermaidBundleStatus(): MermaidBundleStatus {
  const override = process.env.PRD_MERMAID_BUNDLE;
  if (override && existsSync(override)) {
    return { available: true, source: "env", path: override };
  }
  try {
    const require = createRequire(import.meta.url);
    const p = require.resolve("mermaid/dist/mermaid.min.js");
    return { available: true, source: "package", path: p };
  } catch {
    return { available: false, source: "cdn" };
  }
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 生成渲染用 HTML（导出供测试：转义与脚本路径） */
export function buildMermaidHtml(code: string, mermaidSrc: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>body{margin:0;padding:8px;background:#fff;font-family:sans-serif}</style>
</head>
<body>
<div class="mermaid" id="target">${htmlEscape(code)}</div>
<script src="${mermaidSrc}"></script>
<script>
  (async () => {
    try {
      mermaid.initialize({ startOnLoad: false, theme: "default" });
      await mermaid.run({ nodes: [document.getElementById("target")] });
      document.title = "PRD_RENDER_OK";
    } catch (e) {
      document.title = "PRD_RENDER_FAIL: " + (e && e.message ? e.message : String(e));
    }
  })();
</script>
</body></html>`;
}

/** 从 --dump-dom 的输出里取出 <svg>（导出供测试） */
export function extractSvgFromDom(dom: string): string | null {
  const m = /<svg[\s\S]*?<\/svg>/.exec(dom);
  return m ? m[0] : null;
}

/** 从 --dump-dom 输出里取渲染错误（导出供测试） */
export function extractRenderError(dom: string): string | null {
  if (!dom.includes("PRD_RENDER_FAIL")) return null;
  const m = /PRD_RENDER_FAIL:\s*([^<"]+)/.exec(dom);
  return m ? m[1].trim() : "未知错误";
}

export interface LocalRenderResult {
  svg?: string;
  png_path?: string;
  external_script: boolean;
  browser: string;
}

/**
 * 渲染 mermaid 为 SVG（默认）或 PNG。
 * @throws 当浏览器缺失、渲染超时或页面报错时抛错，由调用方决定降级方式
 */
export async function renderMermaidLocal(
  code: string,
  opts: { format?: "svg" | "img"; outDir?: string; timeoutMs?: number } = {}
): Promise<LocalRenderResult> {
  const browser = findBrowser();
  if (!browser) throw new Error("未找到可用浏览器（Edge/Chrome）");

  const format = opts.format ?? "svg";
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const outDir = opts.outDir ?? join(tmpdir(), "prd-diagram");
  mkdirSync(outDir, { recursive: true });

  const mermaid = resolveMermaidSource();
  const hash = createHash("sha1").update(code).digest("hex").slice(0, 8);
  const htmlPath = join(outDir, `diagram-${hash}.html`);
  writeFileSync(htmlPath, buildMermaidHtml(code, mermaid.src), "utf-8");

  const baseArgs = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--window-size=1400,1000",
  ];

  if (format === "img") {
    const pngPath = join(outDir, `diagram-${hash}.png`);
    execFileSync(browser.path, [...baseArgs, `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href], {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: timeoutMs,
    });
    if (!existsSync(pngPath)) throw new Error("截图未生成，浏览器可能不支持 --screenshot");
    return { png_path: pngPath, external_script: mermaid.external, browser: browser.path };
  }

  const stdout = execFileSync(
    browser.path,
    [...baseArgs, "--virtual-time-budget=8000", "--dump-dom", pathToFileURL(htmlPath).href],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }
  );

  const renderError = extractRenderError(stdout);
  if (renderError) throw new Error(`mermaid 渲染失败：${renderError}`);

  const svg = extractSvgFromDom(stdout);
  if (!svg) throw new Error("未在渲染结果中找到 <svg>，浏览器可能未执行脚本");

  return { svg, external_script: mermaid.external, browser: browser.path };
}

/** 把渲染结果写入文件，返回路径 */
export function writeRenderedFile(
  code: string,
  result: LocalRenderResult,
  outDir?: string
): string {
  const dir = outDir ?? join(tmpdir(), "prd-diagram");
  mkdirSync(dir, { recursive: true });
  const hash = createHash("sha1").update(code).digest("hex").slice(0, 8);
  if (result.png_path) return result.png_path;
  const p = join(dir, `diagram-${hash}.svg`);
  writeFileSync(p, result.svg ?? "", "utf-8");
  return p;
}

/** 供测试使用：按平台列出候选路径 */
export function browserCandidates(platform: string): string[] {
  return platform === "win32"
    ? WIN_CANDIDATES.map((c) => c.path)
    : platform === "darwin"
      ? DARWIN_CANDIDATES.map((c) => c.path)
      : [];
}
