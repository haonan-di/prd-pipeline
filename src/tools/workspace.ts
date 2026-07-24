/** workspace 工具 — init / status / config */

import type { WorkspaceConfig } from "../types.js";
import { readConfig, writeConfig, isInitialized, createDefaultConfig } from "../config.js";

export const WORKSPACE_INIT_TOOL = {
  name: "prd/workspace.init",
  description: "Initialize PRD workspace with domain, soul, template, and document system configuration",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        description: "Domain context — e.g. fintech, ecommerce, education, saas",
      },
      soul: {
        type: "string",
        description: "Role persona — e.g. c-end-pm, b-end-pm, general-pm, risk-manager",
      },
      template: {
        type: "string",
        description: "PRD template name — e.g. standard, iteration",
        default: "standard",
      },
      doc_system: {
        type: "string",
        enum: ["local", "confluence", "feishu"],
        description: "Document system for publishing",
        default: "local",
      },
      doc_mcp_server: {
        type: "string",
        description:
          "MCP server name for document system access (e.g., 'wiki-mcp' for Confluence). Required if doc_system is not 'local'. This is the MCP server YOU have configured in your client that can interact with your company's document system.",
      },
      space: {
        type: "string",
        description: "Document space key (Confluence space key, Feishu folder, etc.)",
      },
    },
    required: ["domain", "soul"],
  },
} as const;

export const WORKSPACE_STATUS_TOOL = {
  name: "prd/workspace.status",
  description: "Check if PRD workspace is initialized and show current config",
  inputSchema: {
    type: "object",
    properties: {},
  },
} as const;

export const WORKSPACE_CONFIG_TOOL = {
  name: "prd/workspace.config",
  description: "Update workspace configuration (search habits, spaces, etc.)",
  inputSchema: {
    type: "object",
    properties: {
      recent_spaces: {
        type: "array",
        items: { type: "string" },
        description: "Recently used document spaces",
      },
      recent_keywords: {
        type: "array",
        items: { type: "string" },
        description: "Recently used search keywords",
      },
    },
  },
} as const;

export function handleWorkspaceInit(args: Record<string, unknown>): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  try {
    const config: WorkspaceConfig = {
      version: 1,
      workspace: {
        domain: args.domain as string,
        soul: args.soul as string,
        template: (args.template as string) || "standard",
      },
      document_system: {
        type: (args.doc_system as WorkspaceConfig["document_system"]["type"]) || "local",
        mcp_server: args.doc_mcp_server as string | undefined,
        space: args.space as string | undefined,
      },
      search: {
        recent_spaces: [],
        recent_keywords: [],
      },
    };

    const path = writeConfig(config);

    // 列出可用 preset
    const availableDomains = ["fintech", "ecommerce", "education", "saas"];
    const availableSouls = ["c-end-pm", "b-end-pm", "general-pm", "risk-manager"];

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "initialized",
              config_path: path,
              workspace: config.workspace,
              document_system: config.document_system,
              available_domains: availableDomains,
              available_souls: availableSouls,
              available_templates: ["standard", "iteration"],
              next_steps: [
                "Review domain context in presets/domains/<domain>.md",
                "Review soul persona in presets/souls/<soul>.md",
                "Start discussion with prd/discuss.probe",
              ],
              // 提示用户配置文档系统 MCP
              ...(config.document_system.type !== "local" && !config.document_system.mcp_server
                ? { warning: "doc_mcp_server not set. Document search and publish will not work until configured. Run prd/workspace.config to set it." }
                : {}),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error initializing workspace: ${error}` }],
      isError: true,
    };
  }
}

export function handleWorkspaceStatus(): {
  content: { type: string; text: string }[];
} {
  const initialized = isInitialized();
  if (!initialized) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              initialized: false,
              message: "Workspace not initialized. Call prd/workspace.init first.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const config = readConfig();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ initialized: true, config }, null, 2),
      },
    ],
  };
}

export function handleWorkspaceConfig(args: Record<string, unknown>): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  try {
    const config = readConfig();
    if (!config) {
      return {
        content: [{ type: "text", text: "Workspace not initialized. Call prd/workspace.init first." }],
        isError: true,
      };
    }

    if (args.recent_spaces) {
      config.search.recent_spaces = args.recent_spaces as string[];
    }
    if (args.recent_keywords) {
      config.search.recent_keywords = args.recent_keywords as string[];
    }

    writeConfig(config);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "updated", config }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error updating config: ${error}` }],
      isError: true,
    };
  }
}
