/** 本地发布适配器 — 写入本地 markdown 文件 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PublishAdapter, PublishMetadata, PublishResult } from "./base.js";
import { generatePrdFilename } from "../writer.js";

export class LocalAdapter implements PublishAdapter {
  readonly type = "local" as const;

  async publish(metadata: PublishMetadata): Promise<PublishResult> {
    try {
      // 默认输出到当前目录下的 prd-output/
      const outputDir = join(process.cwd(), "prd-output");

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const filename = generatePrdFilename(metadata.title, metadata.version);
      const filePath = join(outputDir, filename);

      writeFileSync(filePath, metadata.content, "utf-8");

      return {
        success: true,
        path: filePath,
        message: `PRD written to ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to write PRD: ${error}`,
      };
    }
  }
}
