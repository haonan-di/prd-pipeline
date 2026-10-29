---
name: prd-pipeline
description: "完整 PRD 工作流编排 —— 调研、结构化讨论、生成、审查、交付。依赖 prd-pipeline MCP server。"
version: 2.0.0
author: prd-pipeline
tags: [prd, product-management, documentation, workflow]
---

# PRD Pipeline 编排说明书

> 当用户要求**创建 / 讨论 / 迭代 / 发布 PRD（产品需求文档）**时加载本技能。
> **前提**：`prd-pipeline` MCP server 已配置并运行（stdio）。若工具不可用，先提示用户检查配置。

---

## 0. 三条纲领（贯穿全程）

1. **拷问式澄清**——不接受用户的第一版模糊表述。用带选项与推荐答案的探针，把需求逼到**可判定、可执行、可测试**。含糊回答（"都行""看情况"）必须追问一轮。讨论结束的标志是 **frontier 为空**（没有遗留的隐性假设），而不是问满了固定题数。
2. **最小必要**——写进 PRD 的需求默认从简，MVP 之外的进"二期"。判断口径："**砍掉这条，目标还成立吗？**"成立就砍。
3. **合规红线不裁剪**——红线不受"最小必要"约束，该披露的一条不能少。**发现合规红线或事实性错误：立即打断反馈**，不要等到审查阶段（否则后续方案会建立在违规设计上）。

---

## 1. Phase 0 · 工作区与需求绑定

### 1.1 静默自检

调 `prd/workspace.status`。**这是自检，不是对用户的提问**。

- `ready` → 直接干活，不打扰用户；
- `uninitialized` → 进入引导（1.2）；
- `draft` → 说明缺什么，补齐后继续。

### 1.2 引导式初始化（仅未初始化时）

逐项问，**能跳过的就允许跳过**：

1. **文档系统**（可跳过）：`local`（只落本地）/ 在线系统（Confluence/飞书/Notion…）。
   - 选在线时，**只声明、不收集凭证**——问三件事：用哪个文档 MCP、空间/文件夹是什么、父页面 ID 有没有。发布和调研都靠这份声明。
   - 传 `remote_parent_page_id` 后，新建页面会挂在该父页面下；不传则落在空间根下。
   - 跳过 = 仅本地交付，产品依然可用。init 返回里的 `document_system.ready` 为 `false` 时，说明声明不全（缺 MCP 或 space），按 `warnings` 补齐。
2. **预设**：调 `prd/preset.list` 把**实际可用**的领域/人设/模板/阶段集列给用户选（**不要凭记忆编造选项**）。
   - **领域（domain）始终有值**：默认 `general`（通用，不绑定行业）。需求**不属于**任何行业时就用 `general`；若属于某行业（金融/医疗/教育…）则选对应领域预设，以加载该行业的监管红线与术语。**不要**因为"不确定"就选一个不相关的行业领域。
   - 人设、模板按需选择；不确定就用默认（`general-pm` / `standard`）。
3. **交付模式**：`local_first`（默认，先落本地→review→再同步）或 `remote_first`。

调用 `prd/workspace.init` 写入配置：

```json
{
  "domain": "fintech",
  "soul": "c-end-pm",
  "doc_system": "confluence",
  "remote_mcp_server": "用户的文档 MCP 名",
  "remote_space": "FINT",
  "remote_parent_page_id": "可选：父页面 ID",
  "local_path": "用户的 Obsidian vault 路径",
  "workspace_root": "会话所在项目目录（由你依据当前工作目录决定）"
}
```

> **工作区根（`workspace_root`）**：默认由你按**会话的项目目录**派生后传入（如 `<项目>/.prd`）。两条注意：
> - 若会话是从**用户主目录**（`C:\Users\xxx`、`~/`）或某个与需求无关的位置启动的，**不要**把工作区建在那里——**先问用户想把 `.prd` 放在哪**。
> - `prd/workspace.init` 的返回里带 `workspace_root`，**读给用户确认**，让他清楚文件会落在哪。

### 1.3 需求绑定（"这次对话是哪个需求"）

**一个需求一个文件夹** `<workspace_root>/<slug>/`。按序判定，**至多问一次**：

1. 会话工作目录**本身已是需求目录**（含 `state.yaml`）→ 直接用它；
2. 对话里点名了需求 → 直接匹配或新建（**不问**）；
3. 没点名，但项目下存在"活跃需求" → 提议续用（**一句确认**，如"继续 XX 的 PRD？"）；
4. 仍不确定 → **列出该项目下的 slug + 一个「新建需求」选项**，让用户选一次。

> 用户开场就说明给谁写 → **零追问**。

### 1.4 领域复检（任务开始时）

领域在 init 时选，但**需求是之后才说的**——所以任务开始时必须复检一次：

1. 调 `prd/domain.detect({ "text": "<用户的需求描述>" })`；
2. 若返回了 `recommendation`，**把证据说给用户并问是否切换**（例："这个需求涉及借款、回端、征信，命中 fintech 领域关键词，要不要把领域从 general 切到 fintech？"）；
3. 用户确认后，再调 `prd/workspace.init({ "domain": "fintech" })`。

> **绝不静默切换领域。** `general` 只是默认值，不是结论。

---

## 2. Phase 1 · 调研（先弄清历史，再谈方案）

### 2.1 本地历史

调 `prd/context.search`（`{ "query": "关键词" }`）在配置的本地目录检索历史 md。

- 结果**已按相关性排好序**（标题命中 > 路径命中 > 正文多次提及），直接按顺序读前几条即可，不用自己再排；
- 每条带 `score` 与 `matched_in`，用来判断"为什么排在这里"——`matched_in` 只有 `body` 的，
  多半是顺带提了一句，别当成强相关；
- 检索是关键词式的，不是语义检索。拿不到想要的，换个说法（同义词、产品模块名）再查一次，
  或直接把 `limit` 放大。
- 多词查询是 **AND**：`"分期 风控"` 只返回两个词都出现的文档。想放宽就分开查两次。

### 2.2 在线历史（**声明了文档 MCP 时**）

先调 `prd/context.search`（`{ "query": "关键词" }`，`scope` 默认 `auto`），**再执行检索**：

- 返回里的 `remote_plan` 是工具给出的检索计划——平台、space、三条查询（需求 / 技术 / 评审），Confluence 还带 CQL。**按它执行，不要自己另编一套关键词**；
- 具体检索由**你**调用用户声明的文档 MCP 完成，把结果汇总成**带引用**的摘要：已有什么、变了什么、已知约束与历史决策；
- MCP 不可用或空间无权限时**如实告知**，不要用本地结果冒充在线调研；
- 只查本地传 `scope: "local"`；未声明在线系统时读返回里的 `remote_note`。

### 2.3 外部资料

竞品/行业实践用 web 检索（我们自己的工具**不做**联网检索）。内网禁外网时**跳过并告知用户**，不要假装查过。

### 2.4 输出

给用户一份调研摘要：**已有什么**（别重复造）、**自上次以来变了什么**、**已知约束与历史决策**。每条带来源。

---

## 3. Phase 2 · 结构化讨论（核心）

### 3.1 取阶段集

调 `prd/discuss.stages` 拿到当前生效的阶段集（默认：问题 → 方案 → 取舍 → 合规 → 范围）。阶段集由预设决定，**可被用户替换**——按它返回的顺序走，不要写死五阶段。

### 3.2 每阶段循环

```
调 prd/discuss.probe({ stage })        → 拿到该阶段探针（含 2–3 选项 + 推荐 + 理由）
    ↓
一次呈现该阶段的 frontier 问题包（一批，不是一题一挤）
    ↓
用户回答 → 含糊处追问一轮（不接受"同意同意"通过）
    ↓
调 prd/discuss.save({ stage, intent, constraints, decisions, assumptions, open_questions })
    ↓
进入下一阶段
```

**要点**

- 每条探针都**附了推荐答案与理由**：呈现时把推荐项也说出来，给用户一个"可以反对的东西"，比空白填空高效；
- 后续问题依赖前面答案的，**等答案到位再进入下一批**；
- **合规阶段**（`probe_ref: compliance`）的探针由工具**运行时叠加**「合规依据源 + 所选领域红线」——你拿到什么就问什么，不要自造合规问题；
- 合规阶段涉及事实核查（法规红线），**保持开放追问，不要套选择题模板**；
- 每阶段结束**必须** `prd/discuss.save` 落盘——它是 generate 的输入、审查的依据，也是跨会话续起的状态源。
- `discuss.save` 返回 `next_stage` 与 `stages_done`：`stages_done: true` 就是阶段集走完了（`state.yaml` 里
  `stages.current` 记为 `done`）。**以这个标记为准**，不要自己数做了几个阶段——阶段集可能被用户替换成 3 个或 7 个。

### 3.3 讨论收尾

全部阶段走完且 frontier 为空后，汇总讨论日志（Intent / 约束 / 关键决策 / 遗留假设）交用户确认，**确认后才进入生成**。

---

## 4. Phase 3 · 生成 PRD

### 4.1 选模板

调 `prd/preset.get({ "name": "standard", "type": "template" })`。模板的 frontmatter 里声明了 `placeholders`（键 + 是否必填）——**这就是 `sections` 必须覆盖的键**。

> 同名可跨类型（`standard` 既是模板名也是阶段集名），**取模板时必须带 `type: "template"`**。

### 4.2 出图（**图源码由你撰写**）

按内容选图型，**由你写 mermaid 源码**（工具只做校验与渲染，不做"自然语言转图"）：

| 表达内容 | 图型 | 引擎 |
|---------|------|------|
| 业务流程 / 判断分支 | flowchart | mermaid（默认） |
| 系统交互 / 时序 | sequence | mermaid |
| 状态流转 | state | mermaid |
| 方案对比 / 结构 | mindmap | mermaid |
| 排期 | gantt | mermaid |

调 `prd/diagram.build({ "code": "<mermaid源码>", "out_dir": "<任务目录>/assets" })`。它返回源码 / 图片 URL / 本地文件路径（按策略）。**图的落位**不在这里指定——在图嵌入 PRD 时（`prd/generate` 的 `diagrams[].placement`）指定。

- **渲染策略**：
  - `source`：只出源码，零外发；目标平台原生渲染 mermaid 时用它。
  - `local`：**需要图片时优先用它**——本机无头浏览器（Edge/Chrome）渲成 SVG/PNG，图内容不出机器；找不到浏览器或渲染失败会自动降级为 `source` 并在 `warnings` 说明，不要当失败处理。
  - `remote`：mermaid.ink，**内容会外发第三方**。仅当本机无浏览器且必须出图时使用；`config.diagram.render=ask` 时**必须先取得用户逐图确认**，再带 `confirm_remote: true`。
- **drawio**：传 `engine: "drawio"`，源码为 `<mxfile>…</mxfile>`。`local` 只生成 `.drawio` 文件（幂等命名），导出 PNG/SVG 需在 drawio 里打开——别向用户承诺服务端出图。
- 传了 `out_dir` 就落在该目录，随 PRD 归档；不传会落到系统临时目录，重启后可能被清掉。
- **能力自检**：`workspace.init` 返回的 `capabilities.diagram.local_render_ready` 若为 `false`，按 `warnings` 原样转告用户（缺浏览器 → 让用户指定 `PRD_BROWSER_PATH`；缺 mermaid 包 → 提示 `npm i mermaid` 才能离线渲染），不要自己去装依赖。
- 图的**美观要求**：统一主题、单图节点数受控（超了就拆子图）、有标题、**连线要有语义（edge label）**。

### 4.3 生成

调 `prd/generate`：

```json
{
  "title": "需求名称",
  "template": "standard",
  "version": "1.0",
  "changelog": "初版",
  "author": "修订人",
  "sections": {
    "background": "…", "objectives": "…", "details": "…",
    "compliance": "…", "grayscale": "…", "appendix": "…"
  },
  "diagrams": [{ "placement": "details", "source": "graph TD…", "caption": "流程" }]
}
```

- `sections` 的键**必须覆盖模板的 required 占位符**（可显式空串），否则报 `PLACEHOLDER_MISSING`；
- 工具会在渲染后**检出残留占位符**（`PLACEHOLDER_UNRESOLVED`）——有残留就是内容没给全，别硬发。
- **版本号 = 文件身份**：同版本再生成是覆盖同一个 `prd-v<版本>.md`（响应 `overwritten: true`），不会产生 `-2` 副本。
  所以改内容就要同时递增 `version`——如果工具告警「版本号未递增」，把它照实告诉用户，由用户决定是否提版本，
  不要自己悄悄把版本往上推。

---

## 5. Phase 4 · 审查（发布前必过）

### 5.1 确定性检查

调 `prd/review.check({ "content": "<PRD正文>" })`，拿回问题清单：残留占位符 / 空章节 / 修订记录缺失 / 无量化目标 / 全文无图。

返回里的 `passed` 只反映一件事：**有没有 P0**。P1/P2 是改进建议，会照样列在 `findings` 里，
但不会把 `passed` 变成 false——纯文字的小需求不该被"必须有图"卡住。

| 级别 | 检查项 | 处理方式 |
|------|--------|---------|
| P0 | 残留占位符、修订记录缺失 | 必须修完再交付 |
| P1 | 空章节、无量化目标 | 建议修；用户明确放弃可跳过，但要在汇报里说一句 |
| P2 | 全文无图 | 看需求形态：改动小、链路单一可以不画 |

别为了把 `findings` 清空去凑图或凑指标表——凑出来的内容是负资产。

### 5.2 语义审查（**你按清单逐项执行**）

清单来源 = **合规依据源（按产品形态匹配）+ 领域红线 + 人设方法论**（用 `prd/preset.get` 读相关预设）。逐条核对：

- 问题定义是否成立、目标是否**可量化**；
- 方案是否**可执行、可验收**；
- 合规红线是否全部覆盖（**红线不受"最小必要"约束**）；
- 灰度与回滚是否完备；风险披露是否充分。

### 5.3 反馈协议

| 问题类型 | 反馈时机 |
|---------|---------|
| 合规红线、事实性错误 | **发现即打断**（讨论阶段就反馈） |
| 结构 / 清晰度 / 完整性 | **通篇审查后一次性分级反馈** |

产出：`位置 + 级别（P0/P1/P2）+ 修改建议`。**用户确认修改、定稿后**才进入交付。

---

## 6. Phase 5 · 交付

### 6.1 发布确认卡

**定稿后、执行前**呈现一次（默认值全部来自 config，可改可确认）：

```
发布确认：目标系统 = Confluence（默认）· space = FINT（默认）
          父页面 = 按标题检索「XX」或指定 · 版本 = v1.0
          改为本地 Obsidian？回复即可
```

常规流程**仅此一次**确认，不构成周期性打扰。

### 6.2 发布

调 `prd/publish({ "title": "…", "content": "<定稿正文>", "version": "1.0" })`。

- **同标题同版本 = 同一份交付物**：重复发布会覆盖原文件（响应 `local.overwritten: true`），文件名跨日期也不变；
  改了内容再发，记得递增 `version`，否则旧版本被静默改写、用户拿不到对比。

- `local_first`（默认）：**先落本地** → 用户 review → 再用用户声明的文档 MCP **同步到在线系统**（工具返回交接单，**由你去执行**）；
- 目标为在线系统时，工具返回 `remote_handoff`。按它的 `checklist` 顺序执行，其中两条是硬要求：
  - **upsert（先查后建）**：先在 space 内按标题检索，命中同名页面就更新，未命中才新建——不要把同一份 PRD 反复发成副本；
  - **写入后回读**：核对标题、版本号、章节数，确认没有截断。
- `remote_handoff.assets.mermaid_blocks > 0` 且目标平台不原生渲染 mermaid 时，先逐个调 `prd/diagram.build` 出图再嵌入；涉密内容保持 `strategy=source`，不要外发；
- `remote_handoff.warning` 出现时说明缺 MCP 或 space，先回去补 `workspace.init`，不要硬发。

### 6.3 收尾

把落库地址/文件路径回报给用户。

---

## 7. 工具速查（15）

| 分组 | 工具 | 用途 |
|------|------|------|
| 工作区 | `prd/workspace.init` | 初始化/更新配置（**声明文档系统**：类型 + MCP + space + 父页面；可跳过） |
| | `prd/workspace.status` | 静默自检（ready/draft/uninitialized） |
| | `prd/workspace.config` | 改单项配置 |
| | `prd/domain.detect` | 按需求文本推荐领域预设（带命中关键词与理由） |
| 预设 | `prd/preset.list` | 列六类预设（**只有它知道有哪些选项**） |
| | `prd/preset.get` | 读单个预设（同名跨类型要带 `type`） |
| | `prd/preset.validate` | 校验预设（结构 + 目录归属/占位符对齐/重复 id）；传 `dir` 可批量校验自定义目录 |
| 调研 | `prd/context.search` | 本地历史检索 + **在线检索计划**（`remote_plan` 交给 agent 执行） |
| 讨论 | `prd/discuss.stages` | 当前阶段集 |
| | `prd/discuss.probe` | 某阶段探针（合规阶段自动叠加） |
| | `prd/discuss.save` | 结论落盘 + 进度推进 |
| 生成 | `prd/diagram.build` | 图表管道（校验/编码/落源） |
| | `prd/generate` | 模板渲染生成 PRD |
| 审查 | `prd/review.check` | 确定性检查 |
| 交付 | `prd/publish` | 本地交付 + **结构化交接单**（upsert，由 agent 用文档 MCP 执行） |

---

## 8. 常见错误（务必避免）

- ❌ **跳过调研直接谈方案**——PRD 第一大错；
- ❌ **凭记忆列出预设选项**——必须先 `prd/preset.list`；
- ❌ **硬塞配置来掩盖问题**——领域没有更贴切的就用 `general`，**不要**塞一个不相关的行业领域；也不要手动把 `status` 改成 active 来掩盖问题；
- ❌ **讨论不落盘**——每阶段结束必须 `discuss.save`，否则会话一断就丢；
- ❌ **接受含糊回答**——"都行""看情况"必须追问一轮；
- ❌ **合规当实验变量 / 事后才提**——红线不受最小必要约束，发现即打断；
- ❌ **无确认就发 `remote` 图**——内容会外发第三方；
- ❌ **生成后不审查就发布**——必须先过 `review.check` + 语义清单；
- ❌ **假设 mermaid 到处能渲染**——Confluence/飞书需转图片；
- ✅ **讨论先于写作**、**先展示后落库**、**每阶段确认再前进**。
