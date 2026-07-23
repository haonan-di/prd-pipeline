/** 发布适配器接口 */

import type { DocSystemType } from "../types.js";

export interface PublishMetadata {
  title: string;
  content: string;
  parent_id?: string;
  space?: string;
  version?: string;
}

export interface PublishResult {
  success: boolean;
  path?: string;
  url?: string;
  page_id?: string;
  message: string;
}

export interface PublishAdapter {
  readonly type: DocSystemType;
  publish(metadata: PublishMetadata): Promise<PublishResult>;
}
