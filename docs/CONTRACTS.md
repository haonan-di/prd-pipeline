# prd-pipeline 契约 v1（M0 冻结）

> **配套**：唯一需求源 `docs/REQUIREMENTS.md`（v3.4）。
> **地位**：本文件是**实现的唯一接口依据**；机读来源为 `src/contracts/`（zod schema），两者必须一致。
> **冻结分级**：
> - **全局契约**——不得在里程碑之间改动，改动必须走本文档修订记录：输出信封与错误码、config、预设形态、模板↔sections、状态布局、图表引擎接口、讨论阶段/探针、审查项。
> - **逐工具参数**——随里程碑 JIT 细化，但**不得违反全局契约**。
>
> **修订记录**

| 版本 | 时间 | 内容 |
|------|------|------|
| v1 | 2026-10-15 | M0 首次冻结（配套 REQUIREMENTS v3.4） |
| v2 | 2026-10-15 | M2 修订：明确**探针位置**——`StageDef` 增加内联 `probes`；`compliance` 与 `domain` 预设增加 `probes`，供合规阶段叠加（§7.1 / §8.2）；`Probe.stage` 改为可选，由工具按阶段填充。契约文字已说明探针内联，但 v1 的 schema 漏了字段，此为补齐 |
| v3 | 2026-10-27 | 新增**领域识别**：`domain` 预设增加 `keywords[]`；新增工具 `prd/domain.detect`（按关键词打分返回带证据的切换建议，**切换前须用户确认，不得静默切**）。领域默认 `general`，但 `general` 不参与打分（只作兜底） |

---

## 1. 目录与落点

### 1.1 工作区根与需求绑定

- **根 `workspace_root`**：默认 = 会话项目目录下的 `.prd/`。由 **agent** 依据会话项目目录派生后传入（服务器 `cwd` 作兜底）；config 可覆盖为任意路径。
- **需求目录**：`<workspace_root>/<slug>/`——"一个需求一个文件夹"。
- **绑定顺序**（agent 按序执行，至多问一次）：
  1. 会话工作目录**本身已是需求目录**（含 `state.yaml`）→ 直接用它；
  2. 否则在根下定位 slug：对话点名 → 匹配或新建（不问）；存在活跃需求 → 提议续用（一句确认）；仍不确定 → **列出该项目下的 slug + 一个「新建需求」选项**，让用户选一次；
  3. 用户选择「新建需求」→ 新建 slug。
- **slug 规则**：标题 → 去非法字符（`<>:"/\|?*`）→ 空白转 `-` → 截断 50 字符 → **保留中英文**；同名冲突追加 `-2`、`-3`。

### 1.2 任务目录布局

```
<workspace_root>/<slug>/
├── state.yaml              进度与元信息（§1.3）
├── discussion-<stage>.md   每阶段讨论结论（§7）
├── prd-v<version>.md        各版本 PRD 成品
└── assets/                 图源文件（drawio / html / mermaid 等）
```

### 1.3 `state.yaml`

```yaml
version: 1
slug: "login-risk-notice"
title: "登录风险提示优化"
created: "2026-10-15"
updated: "2026-10-15"
stages:
  completed: ["problem", "solution"]
  current: "tradeoff"
current_prd_version: "1.0"
```

- `state.yaml` 的存在即标记该目录是"需求目录"（§1.1 绑定顺序第 1 步）。
- 写入时机：init 绑定需求、`discuss.save`、`generate`、`publish`。

### 1.4 交付落点

| 模式 | 落点 | 行为 |
|------|------|------|
| `local` | `<vault_path>/<subdir>/<日期-标题-版本>.md` | 工具直接写文件 |
| `remote` | 声明的文档系统 | 工具产出**交接指引**，由 agent 用用户的文档 MCP 执行 |
| `local_first`（默认） | 先落 local → review → 再 remote | 两段式 |

---

## 2. config v3

### 2.1 Schema

```yaml
version: 3
status: active               # active | draft
workspace:
  domain: fintech
  product_form: c-end        # c-end | b-end
  soul: c-end-pm
  template: standard
  stages: standard
document_system:
  type: local                # local | confluence | feishu | notion | other
  mode: local_first          # local_first | remote_first
  local:
    vault_path: ""
    subdir: PRD
  remote:                    # 仅协同；不含凭证
    platform: confluence
    mcp_server: ""
    space: ""
    parent_page_id: ""
    sync_note: ""
diagram:
  default_engine: mermaid
  render: ask                # source | local | ask | remote
  engines: []
preset_dirs: []
workspace_root: ""           # 空=由 agent 按会话项目目录派生
search:
  recent_keywords: []
```

### 2.2 字段约束

- `document_system.type` 为 `local` 时 `local.vault_path` 必填（`init` 校验）。
- `document_system.type` ≠ `local` 时 `remote.mcp_server` 可为空（未声明 → 仅本地交付，`status` 提示）。
- `diagram.render` 默认 `ask`。
- 凭证：**config 不存任何在线平台凭证**（凭证由用户的文档 MCP 持有）。

### 2.3 迁移（v1/v2 → v3）

| 变化 | 处理 |
|------|------|
| 新增 `status` / `product_form` / `stages` | 补默认：`active` / `c-end` / `standard` |
| `document_system` 从扁平改为分区 | v1 的 `local_path` → `local.vault_path`；`mcp_server` → `remote.mcp_server`；`space` → `remote.space` |
| 新增 `diagram` / `preset_dirs` / `workspace_root` | 补默认 `{default_engine: mermaid, render: ask}` / `[]` / `""` |
| `search.recent_spaces` | v3 移除（不再有 space 概念于搜索） |

- **规则**：`readConfig` 检测 `version < 3` → 在内存完成迁移 → 首次写入时回写为 v3，`status: active`，不丢用户数据。

---

## 3. 预设（presets）

### 3.1 通用形态

**所有预设 = Markdown + YAML frontmatter**（便于在 Obsidian/编辑器里直接维护）。frontmatter 承载结构化元数据，正文承载知识/说明。

```markdown
---
name: fintech
type: domain
description: 金融科技领域知识
version: 1
---
（正文：行业背景、术语、红线……）
```

- 通用 frontmatter：`name`（必填）、`type`（必填）、`description`、`version`。
- 目录约定：`domains/ souls/ templates/ compliance/ stages/ diagrams/`。

### 3.2 六类预设

| type | 目录 | 特化 frontmatter | 用途 |
|------|------|------------------|------|
| `domain` | `domains/` | — | 行业知识、术语、红线 |
| `soul` | `souls/` | — | 岗位人设、方法论 |
| `template` | `templates/` | `placeholders: [{key, label, required}]` | PRD 模板（§4） |
| `compliance` | `compliance/` | `applies_to: {product_form?, domain?, jurisdiction?}` | 审查依据源（§8） |
| `stages` | `stages/` | `stages: [{id, title, goal, probe_ref?}]` | 讨论阶段集（§7） |
| `diagrams` | `diagrams/` | `engines: [{name, source_format, strategies, options?}]` | 图表引擎声明（§5） |

### 3.3 发现 / 覆盖 / 来源标注

- 扫描顺序：内置 `presets/` → `config.preset_dirs`（后者可覆盖前者）。
- **覆盖键** = `type + name`；同名自定义**覆盖**内置。
- `preset.list` 返回每项：`{type, name, description, source: "builtin"|"custom", path}`。
- `preset.list` 的可用列表**必须由扫描得出**，禁止硬编码（修正现有缺陷）。

### 3.4 校验（`preset.validate`）

- frontmatter 必填字段、`type` 枚举、结构化字段形状；
- 引用完整性：`stages[].probe_ref`、`template.placeholders` 的键唯一性、`diagrams.engines[].strategies` 枚举；
- 返回具体错误：`{file, field, message}` 列表。

---

## 4. 模板 ↔ sections 契约（**重点：修正现有致命错位**）

### 4.1 占位符语法

- 变量：`{{key}}`
- 条件块：`{{#key}}...{{/key}}`（`key` 有值则保留块内容，否则整块移除）

> 采用双花括号，避免与正文中的单花括号冲突；取代现有的 `{key}`（现有实现与模板脱节，导致产物留 `{花括号}`）。

### 4.2 模板 frontmatter

```yaml
---
name: standard
type: template
placeholders:
  - { key: background, label: 需求背景, required: true }
  - { key: details,    label: 需求详述, required: true }
  - { key: appendix,   label: 附录,     required: false }
---
# {{title}}
…
```

- 由工具注入的保留键（不出现在 `placeholders`，但可被模板使用）：`title`、`version`、`date`、`author`。

### 4.3 `generate` 入参与校验

- 入参：`{ slug, title, template, sections: {key: value}, diagrams?, version?, changelog?, author? }`
- 校验：
  1. `template.placeholders` 中每个 `required: true` 的键**必须在 `sections` 中出现**（可显式空串）；缺失 → `PLACEHOLDER_MISSING`；
  2. `sections` 中出现模板未声明的键 → 警告（`data.warnings`），不阻断。

### 4.4 残留占位符检出

- 渲染后若仍匹配 `/{{[#/]?[^}]+}}/` → `PLACEHOLDER_UNRESOLVED`，并报出残留键位置。
- 该检查同时是 `review.check` 的确定性检查项（§8.1）。

---

## 5. 图表引擎契约

### 5.1 引擎接口（内置代码适配器）

```ts
interface DiagramEngine {
  name: string;                                  // 如 "mermaid"
  sourceFormat: string;                          // 如 "mermaid"
  strategies: RenderStrategy[];                  // 支持的渲染策略
  validate(code: string): { ok: true } | { ok: false; errors: string[] };
  build(code: string, strategy: RenderStrategy, opts?: Record<string, unknown>): Promise<DiagramBuildResult>;
}

type RenderStrategy = "source" | "local" | "remote";

interface DiagramBuildResult {
  source: string;                 // 原始图源码
  sourceFormat: string;
  strategyUsed: RenderStrategy;
  imageUrl?: string;              // remote 时
  localPath?: string;             // local 时（落 assets/）
  warnings?: string[];
}
```

### 5.2 声明式引擎（用户免代码接入）

`presets/diagrams/*.md` 的 `engines[]` 项：

```yaml
engines:
  - name: plantuml
    source_format: plantuml
    strategies: [remote]
    options:
      encode: "deflate+base64url"
      remote_url: "https://www.plantuml.com/plantuml/svg/{encoded}"
```

声明式引擎由内核按 `options.encode` 与 `remote_url` 模板执行；复杂引擎（drawio）走 §5.1 代码适配器。

### 5.3 渲染策略与 mermaid.ink 编码（**冻结细节，修正现有 400 缺陷**）

| 策略 | 外发 | 说明 |
|------|:----:|------|
| `source` | 无 | 只返回源码块（目标平台原生渲染） |
| `local` | 无 | 本地渲染成图（后续 drawio/html 走此路） |
| `remote` | **有** | 第三方渲染服务 |
| `ask` | 受控 | 用 `remote` 前须逐图确认（**默认**） |

**mermaid.ink 编码（冻结）**：

```
payload   = JSON.stringify({ code: <mermaid源码>, mermaid: { theme: "default" } })
compressed= zlib.deflateSync(payload)           // RFC1950，等价 pako.deflate
encoded   = base64url(compressed)               // +→-, /→_, 去尾 =
url       = `https://mermaid.ink/svg/${encoded}`
```

> 现有实现错在**直接 deflate 源码字符串**（缺 JSON 包装），必然 400。以上为准。

---

## 6. 工具 I/O 契约

### 6.1 输出信封（全局，冻结）

成功：

```json
{ "ok": true, "data": { } }
```

失败（同时置 MCP `isError: true`）：

```json
{ "ok": false, "error": { "code": "PLACEHOLDER_MISSING", "message": "…", "hint": "…" } }
```

- 文本通道一律返回上述 JSON 字符串；工具保持**无状态分步**，交互编排在 SKILL.md。

### 6.2 错误码表（冻结）

`NOT_INITIALIZED` · `INVALID_INPUT` · `PRESET_NOT_FOUND` · `PRESET_INVALID` · `TEMPLATE_NOT_FOUND` · `PLACEHOLDER_MISSING` · `PLACEHOLDER_UNRESOLVED` · `DIAGRAM_INVALID` · `DIAGRAM_ENGINE_UNKNOWN` · `RENDER_REMOTE_DENIED` · `TASK_NOT_FOUND` · `IO_ERROR` · `UNSUPPORTED`

### 6.3 工具清单

| 工具 | 里程碑 | 用途 | 归属能力 |
|------|:------:|------|----------|
| `prd/workspace.init` | M1 | 初始化/更新工作区（含声明文档系统） | A1 |
| `prd/workspace.status` | M1 | 静默自检：`ready/uninitialized/draft` + 绑定信息 | A2 |
| `prd/workspace.config` | M1 | 更新单项配置 | A3 |
| `prd/preset.list` | M1 | 列出六类预设（内置+自定义，标注来源） | B1 |
| `prd/preset.get` | M1 | 读取单个预设 | B2 |
| `prd/preset.validate` | M2 | 校验自定义预设 | B3 |
| `prd/context.search` | M1 | 本地文档搜索 | C1 |
| `prd/discuss.stages` | M2 | 返回阶段集与阶段规划 | D1 |
| `prd/discuss.probe` | M2 | 返回阶段探针（选项/推荐/理由） | D2 |
| `prd/discuss.save` | M2 | 阶段结论落盘 | D3 |
| `prd/diagram.build` | M1 | 图表管道（校验/编码/落源/返回交付物） | E2 |
| `prd/generate` | M1 | 模板渲染生成 PRD | E1/E3 |
| `prd/review.check` | M2 | 确定性审查 | F1 |
| `prd/publish` | M1 | 本地交付 / 远程交接指引 | G1/G2 |

---

## 7. 讨论阶段集与探针

### 7.1 阶段集（`stages` 预设）

```yaml
stages:
  - { id: problem,    title: 问题定义, goal: 明确要解决的真实问题 }
  - { id: solution,   title: 方案探讨, goal: 对比方案优劣 }
  - { id: tradeoff,   title: 取舍分析, goal: 评估代价与风险 }
  - { id: compliance, title: 合规审查, goal: 检查合规/法务/安全, probe_ref: compliance }
  - { id: scope,      title: 范围界定, goal: 确定 MVP 与灰度 }
```

- `probe_ref` 指向探针来源（默认同名 stages 内联；`compliance` 特化为叠加载入，§8.2）。

### 7.2 探针条目契约

```ts
interface Probe {
  id: string;
  stage: string;
  question: string;
  options?: { label: string; value: string; recommended?: boolean; rationale?: string }[]; // 2–3 个
  allow_open?: boolean;   // 允许自由作答
}
```

- 每条探针**期望**附 2–3 个典型选项 + 默认推荐 + 一句理由（grill-me 式）；合规阶段探针 `allow_open: true`（不套选择题）。

### 7.3 `discussion-<stage>.md` 结构

```
## Intent / ## Constraints / ## Key decisions / ## Surfaced assumptions / ## Open questions
```

---

## 8. 审查契约

### 8.1 确定性检查项（`review.check`，可枚举）

| 检查 | code |
|------|------|
| 残留占位符 `{{…}}` | `PLACEHOLDER_UNRESOLVED` |
| 必备章节为空 | `SECTION_EMPTY` |
| 修订记录缺失/字段空 | `CHANGELOG_MISSING` |
| 无量化目标表 | `METRICS_MISSING` |
| 全文无图 | `DIAGRAM_MISSING` |

### 8.2 语义清单拼装（来源）

```
checklist = compliance.applies_to 匹配（product_form × domain × jurisdiction）的量点
          + domain 红线
          + soul 方法论要点
```

- 用户自定义合规文件自动参与叠加（审查依据源可沉淀）。
- 输出：`{ position, severity: "P0"|"P1"|"P2", suggestion }` 列表。

---

## 9. 测试金字塔（回归依据）

| 层 | 内容 | 命令 | 依赖 |
|----|------|------|:----:|
| L1 契约 | zod schema（config / 六类预设 / 工具信封） | `npm test` | 无 |
| L2 单元 | 模板渲染、占位符检出、ink 编码、预设扫描/覆盖、config 迁移 | `npm test` | 无 |
| L3 集成冒烟 | stdio 全链路（init→…→publish local），断言信封输出 | `npm run smoke` | 无 |
| L4 快照 | 固定 模板+sections → 生成 PRD 等于入库期望文件 | `npm test` | 无 |
| L5 人工 | 真实本地目录 / 真实文档 MCP | 里程碑末 | 有 |
