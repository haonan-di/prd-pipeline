/**
 * 宿主路径校验（M7 验收补充）
 *
 * 背景：workspace_root 与交付目录都存的是「运行 server 那台机器上的路径」。
 * 当 server 跑在与配置来源不同的文件系统/平台时（例如 Windows 上写的
 * `D:\prj\.prd` 被 Linux 上的 server 使用），POSIX 会把整串当成一个合法的
 * 文件名，于是 mkdir 创建一个名字就叫 `D:\prj\.prd` 的目录，并一路返回成功。
 * 属于无声失败：文件落到意料之外的位置，用户看不到任何报错。
 *
 * 这里选择 fail-fast：宁可让调用方拿到明确的错误，也不要在错误的位置写文件。
 */

export class HostPathError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "HostPathError";
    this.field = field;
  }
}

const WIN_ABS_RE = /^[A-Za-z]:[\\/]/;

/**
 * 校验一个宿主路径是否与当前运行平台相容。
 * `platform` 参数仅用于测试注入，生产调用不要传。
 */
export function assertHostPath(
  p: string,
  field: string,
  platform: string = process.platform
): void {
  if (typeof p !== "string" || p.trim() === "") {
    throw new HostPathError(field, `${field} 不能为空`);
  }

  const looksWindows = WIN_ABS_RE.test(p) || p.includes("\\");
  if (platform !== "win32" && looksWindows) {
    throw new HostPathError(
      field,
      `${field}「${p}」看起来是 Windows 路径，但当前运行平台是 ${platform}。` +
        `若继续使用，该路径会被当成单个文件名创建，文件将落到意外位置。`
    );
  }

  const looksPosixAbs = p.startsWith("/");
  if (platform === "win32" && looksPosixAbs) {
    throw new HostPathError(
      field,
      `${field}「${p}」是 POSIX 绝对路径，当前运行平台是 win32，请改用盘符路径。`
    );
  }
}

/** 布尔版本，便于在只想要提示的场合使用 */
export function isHostPathCompatible(
  p: string,
  platform: string = process.platform
): boolean {
  try {
    assertHostPath(p, "path", platform);
    return true;
  } catch {
    return false;
  }
}
