# prd-pipeline

> **MCP Server** for Product Requirements Document (PRD) workflow — research, discuss, generate, and publish.
>
> 让 AI agent 有能力执行完整的产品需求定义流程。

---

## 架构

```
Agent (SKILL.md)                   ← 编排工作流
    │
prd-pipeline MCP Server            ← 11 个工具能力
    │
presets/                           ← 领域知识 + 角色人设 + 模板
```

---

## 安装

### 方式一：克隆仓库（推荐）

```bash
git clone https://github.com/haonan-di/prd-pipeline.git
cd prd-pipeline
npm install
```

### 方式二：npx 直接运行（无需克隆）

> 即将支持，待发布到 npm。

---

## 配置指南

### 通用说明

prd-pipeline 使用 **stdio 传输** 与 MCP 客户端通信。配置时需要指定：

- **command**: `npx`
- **args**: `["tsx", "/你克隆的路径/prd-pipeline/src/index.ts"]`

> ⚠️ `args` 中的路径必须使用 **绝对路径**。把 `/你克隆的路径/` 替换为你实际克隆的位置。

---

### 各客户端配置

<details>
<summary><b>Hermes Desktop</b></summary>

编辑 `config.yaml`（位于 `~/AppData/Local/hermes/config.yaml`），在 `mcp_servers` 中添加：

```yaml
mcp_servers:
  prd-pipeline:
    enabled: true
    command: npx
    args:
      - tsx
      - /你克隆的路径/prd-pipeline/src/index.ts
```

> 配置后重启 Hermes Desktop 即可生效。
</details>

<details>
<summary><b>Claude Desktop</b></summary>

编辑配置文件：

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "prd-pipeline": {
      "command": "npx",
      "args": ["tsx", "/你克隆的路径/prd-pipeline/src/index.ts"]
    }
  }
}
```
</details>

<details>
<summary><b>Claude Code CLI</b></summary>

```bash
# 方式一：命令行添加
claude mcp add prd-pipeline -- npx tsx /你克隆的路径/prd-pipeline/src/index.ts

# 方式二：编辑 ~/.claude/settings.json
```

验证：
```bash
claude mcp list
# 输出应包含 prd-pipeline
```
</details>

<details>
<summary><b>VS Code (Claude Extension)</b></summary>

在项目根目录创建 `.vscode/mcp.json`：

```json
{
  "servers": {
    "prd-pipeline": {
      "command": "npx",
      "args": ["tsx", "/你克隆的路径/prd-pipeline/src/index.ts"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

编辑 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "prd-pipeline": {
      "command": "npx",
      "args": ["tsx", "/你克隆的路径/prd-pipeline/src/index.ts"]
    }
  }
}
```
</details>

---

### 验证配置

配置完成后，向你的 AI agent 提问：

> "调用 prd/workspace.status 检查 prd-pipeline 是否正常"

如果返回 `{"initialized": false}` 则连接成功。

---

## 快速开始

### 第一步：初始化工作区

告诉 agent：

> "初始化 prd-pipeline 工作区，领域 fintech，人设 c-end-pm，文档系统 local，本地路径 /我的文档目录"

agent 会调用 `prd/workspace.init` 完成配置，配置文件 `prd-config.yaml` 会自动生成在项目根目录。

### 第二步：搜索历史文档

> "搜索关于 合规 的文档"

agent 会调用 `prd/context.search` 搜索你配置的本地文档目录。

### 第三步：结构化讨论

agent 会按 5 阶段框架引导你讨论需求：

```
1. problem    — 问题定义
2. solution   — 方案探讨
3. tradeoff   — 取舍分析
4. compliance — 合规审查
5. scope      — 范围界定
```

### 第四步：生成 PRD

讨论完成后，agent 会调用 `prd/generate` 生成 PRD 文档。

### 第五步：发布

```bash
prd/publish(system="local")  → 写入本地文件
prd/publish(system="confluence")  → 发布到 Confluence（需配置文档 MCP）
```

---

## 工具参考

### Workspace

| 工具 | 说明 |
|------|------|
| `prd/workspace.init` | 初始化工作区：选领域、人设、文档系统、模板 |
| `prd/workspace.status` | 查看当前配置 |
| `prd/workspace.config` | 更新配置（文档路径、MCP 服务器等） |

### Research

| 工具 | 说明 |
|------|------|
| `prd/context.search` | 搜索历史文档（本地目录 / Confluence 提示） |

### Discussion

| 工具 | 说明 |
|------|------|
| `prd/discuss.probe` | 结构化讨论引导：5 阶段探针 |

### Templates

| 工具 | 说明 |
|------|------|
| `prd/template.list` | 列出可用模板 |
| `prd/template.get` | 获取模板内容 |

### Diagrams

| 工具 | 说明 |
|------|------|
| `prd/diagram.flowchart` | 生成流程图（Mermaid + mermaid.ink URL） |
| `prd/diagram.sequence` | 生成时序图（支持中文自然语言解析） |

### Generation & Publishing

| 工具 | 说明 |
|------|------|
| `prd/generate` | 从讨论结论 + 模板生成 PRD |
| `prd/publish` | 发布到本地 / Confluence |

---

## 预设内容

```
presets/
├── domains/
│   ├── fintech.md        # 金融科技领域背景
│   ├── ecommerce.md      # (建设中)
│   └── education.md      # (建设中)
├── souls/
│   ├── c-end-pm.md       # C端产品经理
│   ├── general-pm.md     # 通用产品经理
│   ├── b-end-pm.md       # (建设中)
│   └── risk-manager.md   # (建设中)
└── templates/
    ├── standard.md       # 标准 PRD 模板
    └── iteration.md      # 迭代 PRD 模板
```

### 自定义预设

你可以直接编辑 `presets/` 下的文件来适配你的领域和角色：

- `presets/domains/` — 行业知识、监管要求、术语表
- `presets/souls/` — 岗位人设、思考框架、方法论
- `presets/templates/` — PRD 模板结构

---

## 完整工作流

```
Phase 0: 工作区初始化
  prd/workspace.init → 读取 domain/soul presets

Phase 1: 前期调研
  prd/context.search → 阅读历史文档 → 总结调研结论

Phase 2: 结构化讨论
  prd/discuss.probe(problem → solution → tradeoff → compliance → scope)

Phase 3: 生成 PRD
  prd/template.get → prd/diagram.* → prd/generate → 用户 review

Phase 4: 发布
  prd/publish → (Confluence) 通过你的文档 MCP 创建页面
```

详细流程见 [`skill/SKILL.md`](skill/SKILL.md)。

---

## 开发

```bash
npm run dev      # tsx 热启动（开发用）
npm run build    # tsc 编译到 dist/
npm start        # node 运行 dist/index.js
```

## License

Apache-2.0