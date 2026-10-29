# prd-pipeline

> **AI 产品经理副手** —— 把 agent 编排成一个会做 PRD 的产品经理（方法论 + 可插拔的领域知识），并把整条链路串起来：**调研 → 结构化讨论 → 生成 → 审查 → 交付**。
>
> 开源、**中文优先**、**不绑定任何文档平台**。

> **状态**：`v0.2.0`，核心链路已跑通并验证（`npm test` / `npm run smoke`）。需求以 [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) 为唯一源；实现契约见 [`docs/CONTRACTS.md`](docs/CONTRACTS.md)。

---

## 它是什么 / 不是什么

**是**：一个 MCP server + 一份编排 skill + 一套可扩展的知识预设。核心价值是"**逼着 PM 把需求真正想清楚**"，而不是替你堆文档。

**不是**：

- **不是文档连接器** —— 不持有任何平台凭证、不实现平台 API；在线文档系统靠**协同**你已配置的文档 MCP（我们负责"知道你在用什么、产出标准产物、给出交接与检索策略"）。
- **不是某个行业专用** —— fintech 只是内置的一个精样板，内核与领域解耦。
- **不是模板填充器** —— 模板只是最后一公里，过程才是主体。

---

## 架构

```
Agent 编排层   skill/SKILL.md   引导、讨论协议、审查协议、交付确认（无状态）
确定性内核     MCP server       预设扫描 / 模板渲染 / 校验 / 状态落盘 / 图表管道 / 本地写文件
知识层         presets/         领域 / 人设 / 模板 / 合规 / 阶段集 / 图表引擎（纯文件，可扩展可覆盖）
```

---

## 安装

```bash
git clone https://github.com/haonan-di/prd-pipeline.git
cd prd-pipeline
npm install
npm run build      # 编译到 dist/
```

## MCP 客户端配置

server 走 **stdio**。两种入口：

- **编译后**：`node /你的路径/prd-pipeline/dist/index.js`（推荐）
- **开发态**：`npx tsx /你的路径/prd-pipeline/src/index.ts`

> `args` 中的路径必须是**绝对路径**。

<details><summary><b>Claude Desktop</b></summary>

编辑 `%APPDATA%\Claude\claude_desktop_config.json`（macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "prd-pipeline": {
      "command": "node",
      "args": ["/你的路径/prd-pipeline/dist/index.js"]
    }
  }
}
```
</details>

<details><summary><b>Claude Code CLI</b></summary>

```bash
claude mcp add prd-pipeline -- node /你的路径/prd-pipeline/dist/index.js
claude mcp list   # 应包含 prd-pipeline
```
</details>

<details><summary><b>Cursor / VS Code</b></summary>

Cursor 编辑 `~/.cursor/mcp.json`；VS Code 在项目内建 `.vscode/mcp.json`：

```json
{
  "mcpServers": {
    "prd-pipeline": { "command": "node", "args": ["/你的路径/prd-pipeline/dist/index.js"] }
  }
}
```
</details>

**验证连接**：让 agent 调 `prd/workspace.status`，返回 `{"ok":true,...}` 即连接成功。

---

## 快速开始

1. **加载 skill**：把 `skill/SKILL.md` 交给你的 agent（或作为 skill 安装）。
2. **发起任务**，例如：

   > 我要为「借款页综合融资成本明示优化」写 PRD

3. agent 会**静默自检**工作区，未初始化时**引导你**完成配置（文档系统**可跳过**），然后带你走完：

   ```
   调研 → 讨论（问题→方案→取舍→合规→范围）→ 生成 → 审查 → 交付
   ```

**产物**：每个需求一个文件夹 `<项目>/.prd/<slug>/`，内含 `state.yaml`（进度）、`discussion-<阶段>.md`（讨论结论）、`prd-v<版本>.md`（成品）、`assets/`。最终 PRD 落到你配置的本地目录或同步到在线系统。

---

## 工具参考（15）

| 分组 | 工具 | 说明 |
|------|------|------|
| 工作区 | `prd/workspace.init` | 初始化/更新配置（声明文档系统：类型 + MCP + space + 父页面；可跳过） |
| | `prd/workspace.status` | 静默自检：`ready` / `draft` / `uninitialized` |
| | `prd/workspace.config` | 更新单项配置 |
| | `prd/domain.detect` | 按需求文本推荐领域预设（带命中关键词与理由） |
| 预设 | `prd/preset.list` | 列出六类预设（内置 + 自定义，标注来源） |
| | `prd/preset.get` | 读取单个预设（同名跨类型需带 `type`） |
| | `prd/preset.validate` | 校验自定义预设结构 |
| 调研 | `prd/context.search` | 本地历史检索 + 在线检索计划（`remote_plan`，由 agent 用文档 MCP 执行） |
| 讨论 | `prd/discuss.stages` | 返回当前生效的阶段集 |
| | `prd/discuss.probe` | 某阶段探针（含选项/推荐/理由；合规阶段叠加载入） |
| | `prd/discuss.save` | 阶段结论落盘 + 进度推进 |
| 生成 | `prd/diagram.build` | 图表管道（引擎可插拔 + 渲染策略） |
| | `prd/generate` | 按模板渲染生成 PRD |
| 审查 | `prd/review.check` | 确定性检查（占位符/空章节/修订记录/量化目标/图） |
| 交付 | `prd/publish` | 本地交付 + 结构化交接单（upsert：先按标题查，命中则更新，未命中才建） |

所有工具返回统一信封：成功 `{"ok":true,"data":{…}}`，失败 `{"ok":false,"error":{"code","message","hint"}}`。

---

## 预设（可扩展、可覆盖）

```
presets/
├── domains/      领域知识（行业背景、术语、红线；可含领域探针）
├── souls/        岗位人设（思维框架、方法论）
├── templates/    PRD 模板（frontmatter 声明 placeholders）
├── compliance/   合规审查依据源（按 产品形态 × 领域 × 辖区 组织，可增补公司条款）
├── stages/       讨论阶段集（可替换流程；探针内联）
└── diagrams/     图表引擎声明（声明式引擎，用户不写代码即可接入新工具）
```

- 所有预设 = **Markdown + YAML frontmatter**，在编辑器里直接维护；
- **默认领域 = `general`（通用，不绑定行业）**——需求不属于任何行业时就用它；属于某行业则选对应领域预设以加载其监管红线与术语；
- 自定义目录加进 `config.preset_dirs`，**同名覆盖内置**，来源会标注；
- 用 `prd/preset.validate` 自查结构，`prd/preset.list` 看实际可用项。

---

## 开发与验证

```bash
npm run dev      # tsx 开发态
npm run build    # 清 dist + tsc 编译
npm test         # L1 契约 + L2 单元 + L3 集成（不需要联网）
npm run smoke    # 构建后跑真实 stdio MCP 全链路
```

两条都过，说明骨架是通的、且没被改坏。详见 [`docs/HOW-TO-VERIFY.md`](docs/HOW-TO-VERIFY.md)；产物样例见 [`examples/sample-prd.md`](examples/sample-prd.md)。

---

## 文档索引

| 文件 | 作用 |
|------|------|
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | **唯一需求源**（定位、取舍、里程碑、验收） |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | 实现契约（配置/预设/模板/图表/工具 I-O） |
| [`docs/PRESET-AUTHORING.md`](docs/PRESET-AUTHORING.md) | 自定义预设编写指南（目录结构、覆盖规则、校验与常见报错） |
| [`skill/SKILL.md`](skill/SKILL.md) | agent 编排说明书 |
| [`docs/HOW-TO-VERIFY.md`](docs/HOW-TO-VERIFY.md) | 怎么验证 |
| [`docs/archive/`](docs/archive/) | 历史版本（v2.6 需求文档归档） |

---

## License

Apache-2.0
