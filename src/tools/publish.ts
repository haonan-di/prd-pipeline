/** PRD 发布 — prd/publish */

import { readConfig } from "../config.js";
import { LocalAdapter } from "../adapters/local.js";
import { ConfluenceAdapter } from "../adapters/confluence.js";
import type { PublishMetadata } from "../adapters/base.js";

export const PUBLISH_TOOL = {
  name: "prd/publish",
  description:
    "Publish a PRD to the target document system. Supports local (markdown file) and confluence (via wiki-mcp). Uses workspace config to determine target system by default.",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "PRD content to publish",
      },
      title: {
        type: "string",
        description: "PRD title",
      },
      system: {
        type: "string",
        enum: ["auto", "local", "confluence"],
        description:
          "Target system. 'auto' uses the configured document system from workspace init.",
        default: "auto",
      },
      parent_id: {
        type: "string",
        description:
          "Parent page ID for iteration PRDs (Confluence only). Required for child pages.",
      },
      space: {
        type: "string",
        description:
          "Confluence space key. Falls back to workspace config if omitted.",
      },
      version: {
        type: "string",
        description: "PRD version (used in filename for local publish)",
      },
    },
    required: ["content", "title"],
  },
} as const;

export async function handlePublish(
  args: Record<string, unknown>
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  try {
    const content = args.content as string;
    const title = args.title as string;
    let system = (args.system as string) || "auto";
    const parentId = args.parent_id as string | undefined;
    const space = args.space as string | undefined;
    const version = args.version as string | undefined;

    // 确定目标系统
    if (system === "auto") {
      const config = readConfig();
      system = config?.document_system?.type || "local";
    }

    const metadata: PublishMetadata = {
      title,
      content,
      parent_id: parentId,
      space: space || readConfig()?.document_system?.space,
      version,
    };

    let result;
    switch (system) {
      case "local":
        result = await new LocalAdapter().publish(metadata);
        break;
      case "confluence":
        result = await new ConfluenceAdapter().publish(metadata);
        break;
      default:
        return {
          content: [{ type: "text", text: `Unknown system: ${system}` }],
          isError: true,
        };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              system,
              title,
              result,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error publishing PRD: ${error}` }],
      isError: true,
    };
  }
}
