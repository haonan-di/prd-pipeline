/**
 * 宿主路径相容性 —— 回归自 M7 端到端 dogfood：
 * 配置里存的 Windows 路径在非 win32 平台会被当成单个文件名，
 * mkdir 出一个名字就叫 `D:\prj\.prd` 的目录，并一路返回成功（无声失败）。
 * 修复策略是 fail-fast，因此这里锁定「拒绝」而不是「降级」。
 */

import { describe, it, expect } from "vitest";
import { assertHostPath, isHostPathCompatible, HostPathError } from "../paths.js";

describe("assertHostPath", () => {
  it("非 win32 平台拒绝 Windows 绝对路径", () => {
    expect(() => assertHostPath("D:\\prd-pipeline\\.prd", "workspace_root", "linux")).toThrow(
      HostPathError
    );
  });

  it("非 win32 平台拒绝含反斜杠的路径（即使没有盘符）", () => {
    expect(() => assertHostPath("work\\sub", "workspace_root", "linux")).toThrow(HostPathError);
  });

  it("非 win32 平台接受 POSIX 绝对路径", () => {
    expect(() => assertHostPath("/home/me/.prd", "workspace_root", "linux")).not.toThrow();
  });

  it("win32 平台接受盘符路径", () => {
    expect(() => assertHostPath("D:\\prd-pipeline\\.prd", "workspace_root", "win32")).not.toThrow();
  });

  it("win32 平台拒绝 POSIX 绝对路径", () => {
    expect(() => assertHostPath("/home/me/.prd", "workspace_root", "win32")).toThrow(HostPathError);
  });

  it("空路径被拒绝", () => {
    expect(() => assertHostPath("", "workspace_root", "linux")).toThrow(HostPathError);
    expect(() => assertHostPath("   ", "workspace_root", "linux")).toThrow(HostPathError);
  });

  it("错误信息带上字段名与平台，便于定位", () => {
    try {
      assertHostPath("D:\\prd-pipeline\\.prd", "workspace_root", "linux");
      expect.unreachable("应当抛出");
    } catch (error) {
      expect(error).toBeInstanceOf(HostPathError);
      const e = error as HostPathError;
      expect(e.field).toBe("workspace_root");
      expect(e.message).toContain("linux");
      expect(e.message).toContain("D:\\prd-pipeline\\.prd");
    }
  });

  it("isHostPathCompatible 与 assertHostPath 结论一致", () => {
    expect(isHostPathCompatible("D:\\a", "linux")).toBe(false);
    expect(isHostPathCompatible("/a", "linux")).toBe(true);
    expect(isHostPathCompatible("D:\\a", "win32")).toBe(true);
    expect(isHostPathCompatible("/a", "win32")).toBe(false);
  });
});
