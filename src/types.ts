/** prd-pipeline 类型定义 */

/** 文档系统类型 */
export type DocSystemType = "local" | "confluence" | "feishu";

/** PRD 工作区配置 */
export interface WorkspaceConfig {
  version: number;
  workspace: {
    domain: string;
    soul: string;
    template: string;
  };
  document_system: {
    type: DocSystemType;
    /** MCP server name for document access (e.g., 'wiki-mcp', 'feishu-mcp') */
    mcp_server?: string;
    /** Document space key (Confluence space, Feishu folder, etc.) */
    space?: string;
    /** Local document directory path (e.g., Obsidian vault path) */
    local_path?: string;
    /** Confluence parent page ID for iteration PRDs */
    parent_page_id?: string;
  };
  search: {
    recent_spaces: string[];
    recent_keywords: string[];
  };
}

/** 探针阶段 */
export type ProbeStage =
  | "problem"
  | "solution"
  | "tradeoff"
  | "compliance"
  | "scope";

/** 探针问题 */
export interface ProbeQuestion {
  stage: ProbeStage;
  questions: string[];
}

/** 图表生成结果 */
export interface DiagramResult {
  mermaid: string;
  mermaid_ink_url?: string;
  local_path?: string;
}

/** PRD 模板 */
export interface PrdTemplate {
  name: string;
  description: string;
  content: string;
}

/** 发布适配器接口 */
export interface PublishAdapter {
  readonly type: DocSystemType;
  publish(content: string, metadata: PublishMetadata): Promise<string>;
}

export interface PublishMetadata {
  title: string;
  parent_id?: string;
  space?: string;
}
