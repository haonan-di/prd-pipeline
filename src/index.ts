#!/usr/bin/env node

/**
 * prd-pipeline MCP Server
 * 薄 server 确定性内核（契约见 docs/CONTRACTS.md）
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { freshnessWarning } from "./freshness.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  WORKSPACE_INIT_TOOL,
  WORKSPACE_STATUS_TOOL,
  WORKSPACE_CONFIG_TOOL,
  handleWorkspaceInit,
  handleWorkspaceStatus,
  handleWorkspaceConfig,
} from "./tools/workspace.js";
import {
  PRESET_LIST_TOOL,
  PRESET_GET_TOOL,
  PRESET_VALIDATE_TOOL,
  handlePresetList,
  handlePresetGet,
  handlePresetValidate,
} from "./tools/preset.js";
import { CONTEXT_SEARCH_TOOL, handleContextSearch } from "./tools/context.js";
import { DOMAIN_DETECT_TOOL, handleDomainDetect } from "./tools/domain.js";
import {
  DISCUSS_STAGES_TOOL,
  DISCUSS_PROBE_TOOL,
  DISCUSS_SAVE_TOOL,
  handleDiscussStages,
  handleDiscussProbe,
  handleDiscussSave,
} from "./tools/discuss.js";
import { REVIEW_CHECK_TOOL, handleReviewCheck } from "./tools/review.js";
import { DIAGRAM_BUILD_TOOL, handleDiagramBuild } from "./tools/diagram.js";
import { GENERATE_TOOL, handleGenerate } from "./tools/generate.js";
import { PUBLISH_TOOL, handlePublish } from "./tools/publish.js";
import { failResult } from "./envelope.js";

const server = new Server(
  { name: "prd-pipeline", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

const ALL_TOOLS = [
  WORKSPACE_INIT_TOOL,
  WORKSPACE_STATUS_TOOL,
  WORKSPACE_CONFIG_TOOL,
  PRESET_LIST_TOOL,
  PRESET_GET_TOOL,
  PRESET_VALIDATE_TOOL,
  CONTEXT_SEARCH_TOOL,
  DOMAIN_DETECT_TOOL,
  DISCUSS_STAGES_TOOL,
  DISCUSS_PROBE_TOOL,
  DISCUSS_SAVE_TOOL,
  REVIEW_CHECK_TOOL,
  DIAGRAM_BUILD_TOOL,
  GENERATE_TOOL,
  PUBLISH_TOOL,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  switch (name) {
    case "prd/workspace.init":
      return handleWorkspaceInit(a);
    case "prd/workspace.status":
      return handleWorkspaceStatus();
    case "prd/workspace.config":
      return handleWorkspaceConfig(a);
    case "prd/preset.list":
      return handlePresetList(a);
    case "prd/preset.get":
      return handlePresetGet(a);
    case "prd/preset.validate":
      return handlePresetValidate(a);
    case "prd/context.search":
      return handleContextSearch(a);
    case "prd/domain.detect":
      return handleDomainDetect(a);
    case "prd/discuss.stages":
      return handleDiscussStages(a);
    case "prd/discuss.probe":
      return handleDiscussProbe(a);
    case "prd/discuss.save":
      return handleDiscussSave(a);
    case "prd/review.check":
      return handleReviewCheck(a);
    case "prd/diagram.build":
      return await handleDiagramBuild(a);
    case "prd/generate":
      return handleGenerate(a);
    case "prd/publish":
      return handlePublish(a);
    default:
      return failResult("UNSUPPORTED", `未知工具：${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 构建新鲜度：只提示不阻断。dist 旧于 src 时结论不可信（dogfood 踩过）
  const here = dirname(fileURLToPath(import.meta.url));
  const warning = freshnessWarning(join(here, "index.js"), join(here, "..", "src"));
  if (warning) console.error(warning);
  console.error("prd-pipeline MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
