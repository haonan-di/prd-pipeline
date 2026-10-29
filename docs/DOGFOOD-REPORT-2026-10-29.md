# 端到端验证报告（2026-10-29）

范围：v3 内核 M0–M4、M6、M7 已完成后的一次整体验证。分三部分：我能在沙箱里跑的（A）、只能在你的机器/你的账号环境里跑的（B）、以及验证中发现的待决策问题（C）。

---

## A. 已执行

### A1. 文档与代码一致性

| 检查 | 方法 | 结果 |
|------|------|------|
| 工具名 | 从 `src/tools/*.ts` 抽取 `name: "prd/..."`，与 `skill/SKILL.md`、`README.md`、`docs/CONTRACTS.md` 对照 | 15 ↔ 15，双向零差异 |
| 错误码 | 源码中的大写常量 与 `CONTRACTS §6.2` 错误码表对照 | 一致；`CHANGELOG_MISSING / SECTION_EMPTY / METRICS_MISSING / DIAGRAM_MISSING` 属 `§8.1` 审查检查项，不在错误码表，符合设计 |

> 注意：`prd/generate` 与 `prd/publish` 不带点，用 `prd/x.y` 的正则会漏掉它们——审计脚本已按两类分别匹配。

### A2. 自定义预设端到端（M3 验收）

自建预设目录并覆盖/新增三类预设，跑完整链路，13 项断言全过：

- 覆盖内置 `template/standard`（章节键从 `details/compliance` 换成 `decision`），`preset.list` 标出 `overrides_builtin: true`；
- 新增 `stages/lite` 并把工作区切过去，`discuss.stages` 返回 `problem,compliance`，探针 id 变为自定义的 `lite-p1`；
- 新增 `domains/logistics`，`init` 后可用；
- `generate` 用定制模板成功，产物无残留占位符、含定制章节；
- `review.check` 正确检出缺失项；`diagram.build` 可用。

结论：自定义预设不是"列出来好看"，确实贯穿了讨论与生成。

### A3. 完整链路（真实感需求：还款失败自动重试与代扣通道切换）

时序：`init(ready)` → `context.search` → 5 个阶段 `probe/save` → `generate` → `review.check` → `publish`。

产物清点：`discussion-{problem,solution,tradeoff,compliance,scope}.md` 五份齐全，`state.yaml` 阶段进度正确推进到 `scope`，交付目录落到 `vault/PRD/`。

### A4. 边界观察

- 同版本重复 `generate` → 生成 `prd-v1.0-2.md`；
- 同版本重复 `publish` → 生成 `...-v1.0-2.md`；
- `state.yaml` 的 `versions` 只有一条（同版本覆盖），与磁盘上的两份文件不一致（见 C1）。

### A5. 真实 MCP 客户端接入（用户已验）

2026-10-29 由用户在 Claude Code CLI 环境验证通过：工具可见、握手正常、无误报的构建过期告警。后续改动若涉及 `src/index.ts` 的启动流程，需要重跑这一项。

### A6. Windows 路径矩阵（用户已验）

同日执行 `node scripts/check-paths.mjs --base "D:\prd-check"`：普通、含空格、含中文、跨目录四种场景全部落盘正常，且在 win32 上 `/d/prd` 被 `INVALID_INPUT` 拒绝——跨平台路径不会再被当成文件名静默创建。

### A7. 自定义预设中文路径（用户已验）

同日执行 `node scripts/check-presets.mjs --base "D:\prd-check"`：`D:\prd-check\我的预设` 下的六类自定义预设全部被发现、来源标注为 `custom`、批量校验 `scanned=6 / errors=0`；故意放进 `domains/` 的 soul 预设被正确拦截并提示"应放到 souls/"。

---

### A8. 图表渲染能力（用户已验）

2026-10-29 在本机确认：

| 能力 | 结果 |
|------|------|
| drawio CLI | 未安装（`where.exe drawio` 无结果） |
| Microsoft Edge | 已安装，`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，版本 156.0.4314.50 |
| Google Chrome | 已安装，`C:\Program Files\Google\Chrome\Application\chrome.exe` |
| 平台 | win32-x64 |

**对 M5 的结论**：`local` 策略可以落地——用无头 Edge/Chrome 渲染 mermaid，内容不外发。drawio 相关能力收窄为「生成可导入的 `.drawio` 文件」（本质是 XML，无需 CLI），本地导出 PNG/SVG 放二期，不阻塞。

---

## B. 待你执行

V2、V3 已由你在本机执行通过（结论见 A6、A7），对应脚本保留下来做回归。V4、V6、V7 仍待执行，每条都写了"贴什么回来"。

### V2. Windows 路径矩阵（已完成，见 A6）

```powershell
cd D:\prd-pipeline
node scripts\check-paths.mjs --base "D:\prd-check"
```

脚本覆盖四种场景：普通路径、含空格、含中文、跨目录；在 win32 上还会额外跑一条反例（把 `workspace_root` 写成 `/d/prd`，必须被拒绝）。

- **预期**：五行全 PASS，最后一行 `路径自检 PASS`。
- **失败反馈**：贴 FAIL 那几行的完整输出，加 `dir /s /b D:\prd-check`。

### V3. 自定义预设（已完成，见 A7）

```powershell
cd D:\prd-pipeline
node scripts\check-presets.mjs --base "D:\prd-check"
```

脚本会在 `D:\prd-check\我的预设\` 下用内置 `_template.md` 自动生成六类预设（命名为 `my-*`），验证发现与来源标注、批量校验，最后故意把一个 soul 放进 `domains/` 检查是否被拦。

- **预期**：五行全 PASS，最后一行 `预设自检 PASS`。
- **失败反馈**：完整输出 + `D:\prd-check\我的预设` 的目录树。

### V4. 在线交付 upsert（需要你的文档 MCP，无法替代）

整条链路里唯一沙箱验不了的部分。

**准备**：确认文档 MCP 已在客户端可用（Claude Code 里能看到 confluence 或飞书相关工具）；准备一个测试空间和一个父页面 ID。

**第一步，声明**。在客户端里对 agent 说：

> 调 prd/workspace.init，doc_system 设为 confluence，remote_mcp_server 填 `<你的MCP名>`，remote_space 填 `<测试空间>`，remote_parent_page_id 填 `<父页面ID>`

预期：返回 `document_system.ready = true`，`warnings` 为空。

**第二步，首次交付**。接着说：

> 调 prd/publish 交付 slug 为 `<你的slug>` 的 PRD（version 1.0），拿到 remote_handoff 后严格按它的 checklist 用 `<你的MCP名>` 执行，完成把页面链接给我

预期：新建一个页面，挂在父页面下，正文含修订记录表。

**第三步，改一版再交付**：

> 把这份 PRD 重新 generate 成 version 1.1（changelog 写"补充分阶段灰度"），再 publish 一次并按 checklist 执行

预期三条全部成立：

1. **没有产生第二个页面**，第二次是更新同一个页面；
2. 两次 `remote_handoff.doc_key` 完全相同；
3. 页面修订记录表同时有 v1.0 和 v1.1 两行。

- **失败反馈**：两次 `remote_handoff` 的 JSON（可删 content 字段）、两个页面链接，或说明第二次新建了新页面。

### V5. 图表渲染前置确认（已完成）

见 A8：drawio 未安装，Edge 156 与 Chrome 均可用。M5 按「无头浏览器本地渲染 + drawio 只出可导入文件」推进，无需你再操作。

### V6. 真实需求 dogfood（内容质量）

工具链已验证，剩下的是产出质量，只能人判断。

**操作**：挑一个真实的小需求（一句话能说清、但你自己还没想透的那种），在客户端里说：

> 用 prd-pipeline 帮我做一版 PRD：`<一句话需求>`

然后正常回答它的问题，**不要为了让 agent 好写而提前给结论**。

**记录三件事**：

1. 讨论阶段它有没有提出你没想到的约束或风险（有没有出现"推翻初始方案"的时刻）；
2. 定稿后你改了多少——超过 30% 说明探针没问到点上；
3. 哪些问题是噪音（你早就有答案，它还在问）。

- **反馈**：把第 3 点列出来，我据此删减对应探针。

### V7. 回归基线（每次改动后）

```powershell
cd D:\prd-pipeline
npm.cmd run verify:full
```

预期：8 项全 PASS，`tests PASS 121 passed`，`SMOKE PASS`。

## C. 待决策

### C1. 同版本重复生成/发布会产生 `-2` 副本（重要）

现状：同版本号再跑一次 `generate` 得到 `prd-v1.0-2.md`，`publish` 得到 `...-v1.0-2.md`；但 `state.yaml` 的 `versions` 按版本号覆盖，只有一条。结果是**磁盘上两份、状态里一份**，用户不知道该信哪个。

建议：同版本视为"同一修订"——覆盖原文件，返回里标 `overwritten: true`；若内容与上次不同，额外告警"版本号未递增"。与 `state.versions` 按版本覆盖的语义保持一致。

### C2. 全阶段完成后 `state.yaml` 没有 `current` 字段

无害，但契约 §1.3 示例里有 `current`，未说明完成后应为何值。建议明确为"完成后省略"或固定为 `"done"`，避免不同实现各写一套。

### C3. `review.check` 的 `passed` 与 `severity` 不自洽

发现项本身分了级别（`PLACEHOLDER_UNRESOLVED`/`CHANGELOG_MISSING` 是 P0，`SECTION_EMPTY`/`METRICS_MISSING` 是 P1，`DIAGRAM_MISSING` 是 P2），但 `passed` 的算法是 `findings.length === 0`——只要有一条 P2（例如纯文字需求没画图），整体就判"未通过"。

风险：agent 按 SKILL "必须先过 review.check"执行时，会把纯流程需求卡在审查阶段，或者被迫为凑检查而画一张没意义的图。

建议：`passed` 改为「无 P0 即通过」，P1/P2 作为建议随附；或单独返回 `blocking: boolean`，让编排层自己决定是否卡住。这是行为变更，未擅自改。

### C4. `context.search` 本地检索是整行子串匹配

中文场景下"失败"会命中所有含该词的文档，相关性排序靠文件遍历顺序。当前可接受（命中数少时够用），但如果 vault 变大，需要加权（标题命中 > 正文命中）与截断策略。列为 M5 之后的候选。
