#!/usr/bin/env node

/**
 * prd-pipeline — MCP Server for PRD workflow
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  TEMPLATE_LIST_TOOL,
  TEMPLATE_GET_TOOL,
  handleTemplateList,
  handleTemplateGet,
} from "./tools/template.js";
import {
  CONTEXT_SEARCH_TOOL,
  handleContextSearch,
} from "./tools/context.js";
import {
  DISCUSS_PROBE_TOOL,
  handleDiscussProbe,
} from "./tools/discuss.js";
import {
  GENERATE_TOOL,
  handleGenerate,
} from "./tools/generate.js";
import {
  DIAGRAM_FLOWCHART_TOOL,
  DIAGRAM_SEQUENCE_TOOL,
  handleDiagramFlowchart,
  handleDiagramSequence,
} from "./tools/diagram.js";
import {
  PUBLISH_TOOL,
  handlePublish,
} from "./tools/publish.js";

const server = new Server(
  { name: "prd-pipeline", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const ALL_TOOLS = [
  WORKSPACE_INIT_TOOL,
  WORKSPACE_STATUS_TOOL,
  WORKSPACE_CONFIG_TOOL,
  TEMPLATE_LIST_TOOL,
  TEMPLATE_GET_TOOL,
  CONTEXT_SEARCH_TOOL,
  DISCUSS_PROBE_TOOL,
  GENERATE_TOOL,
  DIAGRAM_FLOWCHART_TOOL,
  DIAGRAM_SEQUENCE_TOOL,
  PUBLISH_TOOL,
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: ALL_TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ── Workspace ──
    case "prd/workspace.init":
      return handleWorkspaceInit(args as Record<string, unknown>);
    case "prd/workspace.status":
      return handleWorkspaceStatus();
    case "prd/workspace.config":
      return handleWorkspaceConfig(args as Record<string, unknown>);

    // ── Templates ──
    case "prd/template.list":
      return handleTemplateList();
    case "prd/template.get":
      return handleTemplateGet(args as Record<string, unknown>);

    // ── Context ──
    case "prd/context.search":
      return handleContextSearch(args as Record<string, unknown>);

    // ── Discussion ──
    case "prd/discuss.probe":
      return handleDiscussProbe(args as Record<string, unknown>);

    // ── Generate ──
    case "prd/generate":
      return handleGenerate(args as Record<string, unknown>);

    // ── Diagrams ──
    case "prd/diagram.flowchart":
      return handleDiagramFlowchart(args as Record<string, unknown>);
    case "prd/diagram.sequence":
      return handleDiagramSequence(args as Record<string, unknown>);

    // ── Publish ──
    case "prd/publish":
      return await handlePublish(args as Record<string, unknown>);

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("prd-pipeline MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
