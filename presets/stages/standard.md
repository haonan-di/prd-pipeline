---
name: standard
type: stages
description: 默认讨论阶段集 —— 问题 → 方案 → 取舍 → 合规 → 范围
version: 1
stages:
  - id: problem
    title: 问题定义
    goal: 明确需求要解决的真实问题
    probes:
      - id: p1
        question: 这个需求要解决的真实问题是什么？谁受影响？
        allow_open: true
        options:
          - { label: 用户侧体验/效率, value: user, rationale: 应能挂到体验指标 }
          - { label: 业务/营收, value: business, rationale: 应能挂到业务指标 }
          - { label: 合规/风控驱动, value: compliance, rationale: 红线不可裁剪 }
      - id: p2
        question: 用户现在是怎么绕过这个问题的（workaround）？
        allow_open: true
        options:
          - { label: 手工操作代替, value: manual }
          - { label: 找客服/人工介入, value: support }
          - { label: 干脆放弃这个场景, value: drop }
      - id: p3
        question: 不做这个需求会怎样？影响能否量化？
        allow_open: true
        options:
          - { label: 有数据支撑, value: quantified, rationale: 最强，直接进 PRD }
          - { label: 只有定性判断, value: qualitative, rationale: 需写明假设 }
          - { label: 目前说不清, value: unknown, rationale: 需要继续追问"我们的任何依据" }
  - id: solution
    title: 方案探讨
    goal: 对比不同解决方案的优劣
    probes:
      - id: s1
        question: 最小可用方案（MVP）包含哪些核心能力？
        allow_open: true
        options:
          - { label: 只做核心正向路径, value: core-only, rationale: 最快验证 }
          - { label: 核心 + 关键异常兜底, value: core-plus, rationale: 常见推荐 }
          - { label: 一次做全量, value: full, rationale: 风险与成本最高 }
      - id: s2
        question: 有没有比"新开发"更简单的办法？
        allow_open: true
        options:
          - { label: 用配置/开关即可, value: config, rationale: 成本最低 }
          - { label: 复用现有能力改造, value: reuse }
          - { label: 必须新开发, value: build, rationale: 需说明为何不能复用 }
      - id: s3
        question: 有没有可参考的行业实践或竞品方案？
        allow_open: true
  - id: tradeoff
    title: 取舍分析
    goal: 评估方案选择的代价与风险
    probes:
      - id: t1
        question: 选了这个方案，我们放弃了什么？
        allow_open: true
      - id: t2
        question: 这个方案的失败风险是什么？出问题怎么回滚？
        allow_open: true
        options:
          - { label: 有明确回滚方案, value: rollback-ready, rationale: 上线前提 }
          - { label: 回滚代价高, value: costly-rollback, rationale: 需重新评估 }
      - id: t3
        question: 对后续扩展性有什么影响？
        allow_open: true
  - id: compliance
    title: 合规审查
    goal: 检查合规/法务/安全风险
    probe_ref: compliance
    probes: []
  - id: scope
    title: 范围界定
    goal: 确定 MVP 范围与灰度策略
    probes:
      - id: sc1
        question: 哪些进本期 MVP、哪些放二期？
        allow_open: true
        options:
          - { label: 已在方案阶段锁定, value: locked }
          - { label: 还需再砍, value: trim, rationale: 最小必要原则 }
      - id: sc2
        question: 成功标准怎么量化？在什么时间窗口衡量？
        allow_open: true
      - id: sc3
        question: 灰度方案怎么设计（维度、节奏、回滚）？
        allow_open: true
        options:
          - { label: 按 UID 分桶灰度, value: uid }
          - { label: 按渠道/版本灰度, value: channel }
          - { label: 全量开关, value: switch, rationale: 仅适合低风险改动 }
---

# 默认讨论阶段集

说明：阶段集**可配置**——把它复制进自定义预设目录、改 `stages` 列表，即可替换流程。
`compliance` 阶段的探针**不写在这里**，而是由「合规依据源 + 领域预设」在运行时叠加（见 CONTRACTS.md §7.1 / §8.2）。
探针采用 grill-me 式：每条尽量给出 2–3 个典型选项 + 推荐 + 理由，让用户"有东西可反对"，而不是面对空白填空。
