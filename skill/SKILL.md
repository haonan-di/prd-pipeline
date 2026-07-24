---
name: prd-pipeline
description: "Complete PRD (Product Requirements Document) workflow — research, discuss, generate, and publish. Uses the prd-pipeline MCP server tools."
version: 1.0.0
author: prd-pipeline
tags: [prd, product-management, documentation, workflow]
---

# PRD Pipeline Workflow

> Load this skill when the user asks to create, discuss, iterate, or publish a PRD (产品需求文档).
>
> **Prerequisite:** The `prd-pipeline` MCP server must be configured and running.

---

## Overview

This workflow guides you through a complete product requirements definition process:

```
Research → Discuss → Generate → Review → Publish
```

Each step maps to one or more `prd-pipeline` MCP tools. You orchestrate the flow; the tools do the work.

---

## Phase 0: Workspace Setup

### 0.1 Check Status

Call `prd/workspace.status` to see if the workspace is initialized.

### 0.2 Initialize (if needed)

If not initialized, call `prd/workspace.init`. The agent should **ask the user** about each setting:

1. **Domain** (领域): fintech, ecommerce, education, saas...
2. **Soul** (角色人设): c-end-pm, b-end-pm, general-pm...
3. **Document system** (文档系统):
   - `local` → ask for **local document path** (e.g., Obsidian vault path)
   - `confluence` → ask for **MCP server name** (e.g., `wiki-mcp`) and **space key**
   - `feishu` → ask for **MCP server name** and **folder/app ID**
4. **Template**: standard, iteration...

Example call:
```json
{
  "domain": "fintech",
  "soul": "c-end-pm",
  "doc_system": "local",
  "local_path": "D:\\obsidian\\my_babel_tower_notes",
  "template": "standard"
}
```

> ⚠️ **Always ask the user for document paths/MCP servers.** Never assume or hardcode.

### 0.3 Load Presets

After init, read the relevant preset files to understand domain context and role persona:

- Domain: `presets/domains/<domain>.md` — industry knowledge, regulations, terminology
- Soul: `presets/souls/<soul>.md` — thinking framework, methodology, collaboration style

> **Important:** The domain context and soul persona define HOW you think and WHAT you know. Read them before starting discussion.

---

## Phase 1: Research (前期调研)

> **Goal:** Gather context before discussing solutions. Don't jump to solutions.

### Step 1.1: Search Historical Documents

Call `prd/context.search` to find related PRDs, technical designs, and past discussions:

```json
{
  "query": "[topic keywords]",
  "scope": "auto",
  "limit": 5
}
```

Search for:
- Previous PRDs on the same feature area
- Technical design documents
- Post-mortems / retrospectives
- Compliance or regulatory documents

### Step 1.2: Read Relevant Documents

If search returns useful results, read the documents (using `read_file` or `mcp_wiki_mcp_get_page` for Confluence).

### Step 1.3: Summarize Research Findings

Present a summary to the user:
- What already exists (don't reinvent)
- What changed since the last version
- Known constraints and past decisions

---

## Phase 2: Structured Discussion (方案探讨)

> **Goal:** Use the probe framework to guide the user through requirements definition.
>
> **Flow:** problem → solution → tradeoff → compliance → scope
>
> **Principle:** Ask, don't tell. Let the user arrive at conclusions through guided questions.

### Step 2.1: Problem Definition (问题定义)

Call `prd/discuss.probe` with `stage: "problem"`:

```json
{ "stage": "problem" }
```

Use the returned questions to guide the conversation. Probe for:
- Who is the real user? Scale?
- What's the current workaround?
- What happens if we don't do this?
- Is there data to quantify the impact?

**Summarize** the problem definition after discussion.

### Step 2.2: Solution Exploration (方案探讨)

Call `prd/discuss.probe` with `stage: "solution"`:

```json
{ "stage": "solution" }
```

Guide the user to:
- List all possible approaches (don't converge too early)
- Compare pros and cons
- Reference industry best practices
- Define MVP scope

### Step 2.3: Trade-off Analysis (取舍分析)

Call `prd/discuss.probe` with `stage: "tradeoff"`:

```json
{ "stage": "tradeoff" }
```

Help the user evaluate:
- What are we giving up?
- Technical cost vs business value
- Extensibility implications
- Failure modes and rollback plans

### Step 2.4: Compliance Review (合规审查)

Call `prd/discuss.probe` with `stage: "compliance"`:

```json
{ "stage": "compliance" }
```

Check against:
- Domain-specific regulations (from domain context)
- Data privacy requirements
- Security concerns
- Approval processes needed

> **For fintech:** Reference the domain context for specific regulations (金规, 个人信息保护法, etc.)

### Step 2.5: Scope Definition (范围界定)

Call `prd/discuss.probe` with `stage: "scope"`:

```json
{ "stage": "scope" }
```

Define:
- MVP boundaries (what's in, what's out for v1)
- Dependencies and prerequisites
- Success criteria and metrics
- Gray release / A/B test plan
- Monitoring and reporting needs

### After All Stages

Present a **discussion summary** covering:
- Problem statement
- Selected solution (with rationale)
- Key trade-offs made
- Compliance items addressed
- MVP scope and success metrics

Get user confirmation before moving to generation.

---

## Phase 3: Generate PRD (撰写 PRD)

> **Goal:** Produce the PRD document from discussion output.

### Step 3.1: Select Template

Call `prd/template.list` to see available templates, then `prd/template.get` to load one:

```json
{ "name": "standard" }    // or "iteration" for iterative changes
```

### Step 3.2: Generate Diagrams

Call `prd/diagram.flowchart` or `prd/diagram.sequence` for each diagram needed:

```json
{
  "description": "[flow description from discussion]",
  "format": "both"
}
```

Returns:
- `mermaid`: Mermaid code (for Obsidian/GitHub rendering)
- `mermaid_ink_url`: Image URL (for Confluence/Feishu embedding)

> **Platform rendering:**
> - **Obsidian / GitHub:** Use ` ```mermaid ` code block — renders natively
> - **Confluence:** Use `mermaid_ink_url` via `<ac:image><ri:url>` — mermaid.ink encodes via zlib+base64
> - **Feishu:** Use `mermaid_ink_url` or download image and upload as attachment
> - **Fallback:** If mermaid.ink is unreachable, tell the user to screenshot the rendered diagram

### Step 3.3: Generate PRD

Call `prd/generate` with the discussion content:

```json
{
  "title": "[PRD title]",
  "template": "standard",
  "sections": {
    "background": "[from Phase 1 + Phase 2.1]",
    "objectives": "[from Phase 2.5 success criteria]",
    "details": "[from Phase 2.2 solution details]",
    "grayscale": "[from Phase 2.5 gray release plan]",
    "compliance": "[from Phase 2.4 compliance review]"
  },
  "diagrams": [
    {
      "placement": "details",
      "mermaid": "[mermaid code from Step 3.2]",
      "caption": "[diagram title]"
    }
  ],
  "version": "1.0"
}
```

### Step 3.4: Present for Review

Show the generated PRD to the user. Ask for feedback on:
- Completeness (are all sections covered?)
- Accuracy (does it match the discussion?)
- Clarity (is the language clear enough for dev/design/test to understand?)

---

## Phase 4: Review & Iterate (评审与迭代)

> **Goal:** Refine the PRD based on stakeholder feedback.

### Step 4.1: Handle Review Feedback

When the user requests changes:
1. **Mark revisions with strikethrough** — don't delete content immediately
2. Use ` ~~strikethrough~~ ` for removed lines
3. For mermaid diagrams, use `%% ~~comment~~` to annotate removed branches
4. Keep the document syntactically valid while marked

### Step 4.2: Iterate the PRD

After confirmation, regenerate with `template: "iteration"`:

```json
{
  "title": "[PRD title] (v1.1)",
  "template": "iteration",
  "version": "1.1",
  "sections": {
    "background": "[change rationale]"
  }
}
```

---

## Phase 5: Publish (发布)

> **Goal:** Deliver the final PRD to the target document system.

### Step 5.1: Publish

Call `prd/publish`:

```json
{
  "content": "[final PRD markdown]",
  "title": "[PRD title]",
  "system": "confluence",    // or "local"
  "space": "[space key]",    // Confluence only
  "parent_id": "[page id]",  // for iteration PRDs (child page)
  "version": "1.0"
}
```

### Step 5.2: For Confluence

The publish tool returns prepared HTML and instructions referencing your configured MCP server (e.g., `wiki-mcp`, `feishu-mcp`). Execute them:

1. Call your document MCP server to verify connection
2. Call your document MCP server to create the page with the HTML body
3. For iteration PRDs: use `parentId` to create as child page

> **Note:** The MCP server name is set during `prd/workspace.init` via the `doc_mcp_server` parameter. If you didn't set it, run `prd/workspace.config` to update it.

### Step 5.3: Verify

After publishing, verify the page was created correctly:
- For local: confirm the file exists at the returned path
- For Confluence: open the page URL to verify rendering

---

## Best Practices

### Discussion Protocol

- **Discuss first, write later** — never skip to writing without user confirmation
- **Probe, don't prescribe** — ask questions that help the user think, don't give answers
- **One stage at a time** — complete problem definition before moving to solutions
- **Summarize after each stage** — confirm understanding before progressing

### Writing Guidelines

- **Scenarios over features** — describe user scenarios, not just feature lists
- **Flowcharts over text** — use diagrams for processes, tables for comparisons
- **Error handling included** — every normal flow needs its exception flow
- **Metrics defined** — every objective needs a measurable success criterion

### Platform Awareness

| Platform | Mermaid rendering | Use |
|----------|:-----------------:|-----|
| Obsidian / GitHub MD | ✅ Native | ` ```mermaid ` code block |
| Confluence | ❌ Not supported | `mermaid_ink_url` as image |
| Feishu | ❌ Not supported | `mermaid_ink_url` or upload image |
| Fallback | — | Tell user to screenshot |

### Compliance First

When working in regulated industries (fintech, healthcare, etc.):
- Compliance red lines apply to ALL experiment groups — never treat as experiment variable
- Reference domain context for specific regulations
- When in doubt, escalate to the compliance stage

### Revision Management

- Use strikethrough for mid-discussion changes
- Only clean up strikethrough when user explicitly says to finalize
- For iteration PRDs, clearly mark what changed vs what stayed the same

---

## Pitfalls

- ❌ **Don't skip research** — jumping to solutions without reading historical context is the #1 PRD mistake
- ❌ **Don't converge too early** — let the user explore multiple solutions before picking one
- ❌ **Don't write while discussing** — keep the conversation focused on thinking, not drafting
- ❌ **Don't ignore compliance** — always run the compliance stage, even if the requirement seems simple
- ❌ **Don't assume mermaid renders everywhere** — always provide image fallback for Confluence/Feishu
- ❌ **Don't publish without review** — always present the generated PRD for user feedback first
- ✅ **Read the domain context** — it contains regulations, terminology, and industry patterns you won't know otherwise
- ✅ **Probe before proposing** — let the user's answers guide the solution, not your assumptions
- ✅ **Confirm after each phase** — get explicit user agreement before moving from discussion to generation, and from generation to publishing
