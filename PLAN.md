# prd-pipeline 实施计划

> 通用、可插拔的 PRD 工作流 MCP Server + Agent Skill
> 让 AI agent 有能力执行完整的产品需求定义流程

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Agent 层 (SKILL.md)                   │
│  编排工作流：调研 → 读文档 → 探讨 → 审查 → 撰写 → 发布  │
├─────────────────────────────────────────────────────────┤
│                  工具层 (MCP Server)                     │
│  @modelcontextprotocol/sdk + TypeScript                 │
│                                                         │
│  tools/                         adapters/               │
│  ├─ workspace.init              ├─ base.ts              │
│  ├─ context.search              ├─ local.ts             │
│  ├─ context.read                ├─ confluence.ts        │
│  ├─ discuss.probe               └─ feishu.ts            │
│  ├─ template.*                                        │
│  ├─ generate.*                 presets/                 │
│  ├─ diagram.*                  ├─ domains/              │
│  ├─ publish.*                  ├─ souls/                │
│  ├─ review.*                   └─ templates/            │
│  └─ revision.*                                         │
├─────────────────────────────────────────────────────────┤
│            MCP Client (Hermes / Claude Desktop / etc.)   │
└─────────────────────────────────────────────────────────┘
```

---

## 二、优先级定义

| 层级 | 含义 | 交付物标准 |
|------|------|-----------|
| **P0** | MVP，必须可用 | 单用户可跑通完整流程：init → discuss → generate → local publish |
| **P1** | 重要，MVP 后立即做 | 补齐生产环境必须的能力 |
| **P2** | 增强，有价值但可延后 | 更多适配器、更多 preset、插件 UI |

---

## 三、P0 — MVP（最小可用）

### P0-1：项目脚手架

**目标：** 搭建 TypeScript MCP Server 骨架，可启动、可被 MCP 客户端发现

**文件：**
```
Create: package.json          — dependencies: @modelcontextprotocol/sdk, zod, yaml
Create: tsconfig.json         — strict mode, ESNext
Create: src/index.ts          — MCP Server 入口，注册所有 tool handlers
Create: .gitignore
Create: README.md (stub)
```

**验收标准：**
- `npx tsx src/index.ts` 启动后，MCP 客户端能通过 stdio 发现已注册的 tool 列表
- 所有 tool 返回正确的 JSON-RPC 响应格式

---

### P0-2：Workspace Init

**目标：** 用户初始化项目时，agent 引导式配置领域、soul、模板、文档系统

**工具：** `prd/workspace.init`

**流程：**
1. agent 调用 `workspace.init` → 返回配置问卷
2. agent 逐一提问：领域（fintech/电商/教育...）、soul（C端PM/风控...）、文档系统（confluence/local...）
3. 生成 `prd-config.yaml` 存入 workspace

**文件：**
```
Create: src/tools/workspace.ts
Create: src/config.ts          — 配置读写逻辑
Create: src/types.ts           — 类型定义
```

**配置产物示例：**
```yaml
# prd-config.yaml
version: 1
workspace:
  domain: fintech              # 关联 presets/domains/fintech.md
  soul: c-end-pm               # 关联 presets/souls/c-end-pm.md
  template: standard           # 关联 presets/templates/standard.md
document_system:
  type: local                  # local | confluence | feishu
search:
  recent_spaces: []            # 常用空间，逐渐积累
```

---

### P0-3：领域背景 & Soul 预设

**目标：** 提供开箱即用的领域知识和角色人设

**文件：**
```
Create: presets/domains/fintech.md     — 金融科技领域背景
Create: presets/souls/c-end-pm.md      — C端产品经理角色
Create: presets/souls/general-pm.md    — 通用PM角色（兜底）
```

**fintech.md 包含：**
- 行业概述（助贷、联合贷、导流等模式）
- 监管框架（金规、八部委、消费者保护）
- 核心术语表（IRR/APR、M0+/M1+、通过率、资方、资金路由...）
- 常见业务模块（借款、还款、绑卡、风控、费用...）
- 合规红线（24%/36% 利率上限、强制阅读、征信授权...）
- 行业基准数据（转化率、客诉率、逾期率参考范围）
- 竞品格局（头部玩家、模式差异）

**soul.md 包含：**
- 角色定位（一句话）
- 思考框架（如何分析问题、做决策）
- 常用方法论（用户分层、A/B 实验、漏斗分析、KANO...）
- 沟通风格（如何写 PRD、如何与开发/设计/运营协作）
- 质量要求（什么场景下 must have / nice to have）

---

### P0-4：PRD 模板管理

**目标：** 用户可选择或自定义 PRD 模板

**工具：** `prd/template.list`、`prd/template.get`

**文件：**
```
Create: src/tools/template.ts
Create: presets/templates/standard.md    — 标准 PRD 模板
Create: presets/templates/iteration.md   — 迭代 PRD 模板
```

**标准模板结构：**
```markdown
# {需求名称}

## PRD 修订记录
| 版本 | 时间 | 修订内容 | 修订人 |

## 一、项目/需求背景
- 问题分析
- 场景描述
- 关联文档

## 二、目标和收益
- 量化目标
- 达成路径
- 评估方式

## 三、需求详述
- 需求列表
- 流程图
- 交互说明
- 数据埋点

## 四、灰度方案
- 实验设计
- 灰度策略

## 五、合规/风险披露
- 合规审查
- 资金风险

## 六、附录
- 关联 PRD
- 技术方案链接
```

---

### P0-5：上下文搜索（前期调研 + 历史文档）

**目标：** agent 能搜索历史 PRD、技术方案、复盘文档

**工具：** `prd/context.search`

**输入：** query, scope（local | confluence）, limit

**行为：**
- local scope：搜索本地 workspace 内的文档
- confluence scope：通过 wiki-mcp 搜索 Confluence（需要配置对接）
- 返回：文档标题、摘要、匹配片段、来源

**文件：**
```
Create: src/tools/context.ts
```

---

### P0-6：讨论引导（产品方案构思）

**目标：** 通用 PM 工作流的讨论框架，引导 agent 和用户完成需求定义

**工具：** `prd/discuss.probe`

**工作流（由 SKILL.md 编排）：**

```
Step 1: 前期调研
  → prd/context.search(query="[需求关键词]")
  → 了解背景、竞品、行业动态

Step 2: 历史文档阅读
  → prd/context.search(query="[相关PRD/技术方案]")
  → 读已有 PRD、技术方案、复盘

Step 3: 方案探讨（核心）
  → prd/discuss.probe(stage="problem")      # 问题定义
  → prd/discuss.probe(stage="solution")     # 方案对比
  → prd/discuss.probe(stage="tradeoff")     # 取舍分析

Step 4: 合规/法律审查
  → 读取领域.md 合规章节
  → prd/discuss.probe(stage="compliance")   # 合规检查

Step 5: 整体 review
  → 汇总讨论结论
  → agent 输出讨论摘要
```

**`discuss.probe` 的行为：**
- 根据 `stage` 返回不同维度的探针问题（通用，行业无关）
- agent 用这些问题引导用户思考，而不是直接给答案
- 探针维度：

| stage | 探针问题 |
|-------|---------|
| problem | 这个需求的真实用户是谁？解决了什么痛点？不做有什么影响？ |
| solution | 有哪些可能的方案？各自的优缺点？ROI 如何？ |
| tradeoff | 选这个方案放弃了什么？技术成本？用户体验损失？ |
| compliance | 涉及哪些合规/法务关注点？需要什么审批？ |
| scope | MVP 范围？二期规划？ |

**文件：**
```
Create: src/tools/discuss.ts
Create: src/probes/             — 探针问题库
```

---

### P0-7：PRD 撰写

**目标：** 根据讨论结论 + 模板，生成 PRD 文档

**工具：** `prd/generate`

**输入：** template (模板名), discussion_summary (讨论结论), sections (需要生成的章节)

**行为：**
- 读取模板
- 填入讨论结论
- 在流程图中预留图表占位

**文件：**
```
Create: src/tools/generate.ts
Create: src/writer.ts           — 模板渲染引擎
```

---

### P0-8：图表生成

**目标：** 自动生成流程图 + 交互图，嵌入 PRD，适配多平台渲染

**工具：** `prd/diagram.flowchart`、`prd/diagram.sequence`

**输入：** description（流程描述）, platform（目标平台: local | confluence | feishu）

**输出（三种格式同时返回）：**
```
{
  mermaid: "graph TD\n  A[开始] --> B...",       // Mermaid 代码
  mermaid_ink_url: "https://mermaid.ink/svg/...",  // 编码后的图片 URL
  local_path: "assets/flow-xxx.png"                 // 本地保存的图片
}
```

**平台策略：**

| 平台 | PRD 内嵌方式 | 使用的输出 |
|------|-------------|-----------|
| **Obsidian / 本地 MD** | ` ```mermaid ` 代码块 | mermaid code（原生渲染） |
| **Confluence** | `<ac:image><ri:url>` 嵌入 mermaid.ink | mermaid.ink URL（zlib+base64 编码） |
| **飞书** | 上传图片附件 | local_path 图片 + mermaid code 兜底 |

**兜底机制：**
- mermaid.ink 不可达时 → 提示用户 "请在本地渲染后截图"
- 本地保存 PNG 作为最终兜底（puppeteer/satori 渲染，P1 增强）

**交互图：**
- 系统交互 / 时序 → Mermaid sequence diagram
- 用户流程 / 页面流转 → Mermaid state diagram
- 界面线框图 → agent 生成 HTML/CSS → 用户截图

**文件：**
```
Create: src/tools/diagram.ts
Create: src/diagram/flowchart.ts
Create: src/diagram/sequence.ts
Create: src/diagram/ink.ts           — mermaid.ink 编码逻辑
```

---

### P0-9：PRD 发布（本地 + Confluence）

**目标：** 将 PRD 发布到目标系统，支持本地和 Confluence

**工具：** `prd/publish`

**输入：** content (PRD 内容), title (标题), system (local | confluence), options

**行为：**
- local：写入本地 markdown 文件，自动组织目录结构
- confluence：通过 wiki-mcp 创建/更新 Confluence 页面
  - 标准 PRD → 创建新页面（支持 parentId 嵌套）
  - 迭代 PRD → 创建子页面，自动关联父文档

**发布策略：**

| system | 行为 | 依赖 |
|--------|------|------|
| local | 写入本地 MD 文件 | 无 |
| confluence | 调用 wiki-mcp 创建/更新页面 | wiki-mcp MCP Server |

**文件：**
```
Create: src/tools/publish.ts
Create: src/adapters/base.ts
Create: src/adapters/local.ts
Create: src/adapters/confluence.ts
```

---

### P0-10：SKILL.md（Agent 编排层）

**目标：** 告诉 agent 如何按正确顺序调用 MCP 工具

**文件：**
```
Create: skill/SKILL.md
```

**内容：**
- 加载条件
- 完整工作流编排（P0-5 ~ P0-9 的顺序和判断逻辑）
- 最佳实践
- 常见陷阱

---

## 四、P1 — 重要增强

| 序号 | 能力 | 说明 |
|------|------|------|
| P1-1 | **Confluence 适配器** | 集成 wiki-mcp，支持发布到 Confluence + 创建子页面 |
| P1-2 | **版本管理** | `prd/revision.diff` 对比版本差异，`prd/revision.log` 查看历史 |
| P1-3 | **评审流程** | `prd/review.submit` 提交评审，`prd/review.iterate` 按意见修改 |
| P1-4 | **搜索习惯管理** | 自动积累常用空间/关键词，`prd/workspace.config` 可查看/编辑 |
| P1-5 | **更多 preset** | 电商、教育、SaaS 等领域背景；B 端 PM、风控、运营等 soul |
| P1-6 | **更多模板** | 用户故事模板、MRD 模板、BRD 模板 |

---

## 五、P2 — 增强与生态

| 序号 | 能力 | 说明 |
|------|------|------|
| P2-1 | **飞书适配器** | 飞书文档 API 对接 |
| P2-2 | **需求卡片对接** | 创建 PRD 时自动创建 TAPD/Jira/Linear 卡片 |
| P2-3 | **埋点需求生成** | PRD 附录自动生成埋点清单 |
| P2-4 | **Figma 集成** | PRD 中嵌入原型链接和截图 |
| P2-5 | **Hermes Plugin 界面** | 如仍有需要，补充可视化配置面板 |
| P2-6 | **插件市场** | 支持社区贡献的 adapter 和 preset |

---

## 六、任务依赖关系

```
P0-1 脚手架
  └─ P0-2 Workspace Init
      ├─ P0-3 Presets（领域 + soul）
      ├─ P0-4 模板管理
      ├─ P0-5 上下文搜索
      │    └─ P0-6 讨论引导（依赖搜索能力）
      │         └─ P0-7 PRD 撰写（依赖讨论结论）
      │              ├─ P0-8 图表生成（嵌入 PRD）
      │              └─ P0-9 本地发布（输出 PRD）
      └─ P0-10 SKILL.md（编排所有 P0 工具）

P1 全部在 P0 之后
P2 全部在 P1 之后
```

---

## 七、目录结构（完整）

```
D:\prd-pipeline\
├── PLAN.md                       # 本计划
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
│
├── src/
│   ├── index.ts                  # MCP Server 入口
│   ├── types.ts                  # 类型定义
│   ├── config.ts                 # 配置读写
│   │
│   ├── tools/
│   │   ├── workspace.ts          # init, status, config
│   │   ├── context.ts            # search, read
│   │   ├── discuss.ts            # probe
│   │   ├── template.ts           # list, get
│   │   ├── generate.ts           # write
│   │   ├── diagram.ts            # flowchart, interaction
│   │   ├── publish.ts            # publish
│   │   ├── review.ts             # submit, status, iterate (P1)
│   │   └── revision.ts           # diff, log, branch (P1)
│   │
│   ├── adapters/
│   │   ├── base.ts
│   │   ├── local.ts
│   │   ├── confluence.ts         # P1
│   │   └── feishu.ts             # P2
│   │
│   ├── writer.ts                 # 模板渲染引擎
│   ├── probes/                   # 探针问题库
│   │   └── index.ts
│   └── diagram/                  # 图表生成
│       ├── flowchart.ts
│       └── interaction.ts
│
├── presets/
│   ├── domains/
│   │   ├── fintech.md
│   │   ├── ecommerce.md          # P1
│   │   └── education.md          # P1
│   ├── souls/
│   │   ├── c-end-pm.md
│   │   ├── general-pm.md
│   │   ├── b-end-pm.md           # P1
│   │   └── risk-manager.md       # P1
│   └── templates/
│       ├── standard.md
│       ├── iteration.md
│       ├── user-story.md         # P1
│       └── mrd.md                # P1
│
└── skill/
    └── SKILL.md                  # Agent 编排指令
```

---

## 八、启动顺序建议

| 阶段 | 内容 | 预计工作量 |
|------|------|-----------|
| **Sprint 1** | P0-1 脚手架 + P0-2 Workspace Init + P0-3 Presets | 基础骨架 |
| **Sprint 2** | P0-4 模板 + P0-5 搜索 + P0-6 讨论引导 | 核心流程 |
| **Sprint 3** | P0-7 撰写 + P0-8 图表 + P0-9 发布 | 产出能力 |
| **Sprint 4** | P0-10 SKILL.md + 端到端验证 | 可跑通 |
| **Sprint 5+** | P1 各能力 | 完善 |
