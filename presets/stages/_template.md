---
# 阶段集预设模板 —— 复制到 <preset_dirs>/stages/<你的阶段集>.md
#
# 作用：定义讨论阶段的顺序与每阶段的探针。agent 按返回顺序逐阶段推进。
#
# 字段说明
#   name          必填。阶段集标识（如 standard、lite、tech-heavy）
#   type          必填。固定为 stages
#   stages        必填。有序阶段数组
#     id          必填且唯一。落盘文件名是 discussion-<id>.md，改动会影响历史文件对应关系
#     title       必填。给人看的阶段名
#     goal        必填。一句话说明这个阶段要收敛什么
#     probe_ref   可选。指向探针来源：写 "compliance" 时，运行时自动叠加
#                 「合规依据源 + 领域红线」，不要在这里重复抄合规题
#     probes      该阶段内联探针；每项含 question、可选 options（2–3 个，
#                 recommended 标推荐项）、allow_open 允许自由作答
#
# 设计建议
#   · 问题定义与取舍阶段不要省，省了会退化成"直接写文档"
#   · 每个阶段 2–4 个探针足够，探针太多会让讨论失焦
#   · 合规阶段用 probe_ref: compliance，不要内联
name: example-stages
type: stages
description: 示例阶段集 —— 说明这套阶段适用什么类型的需求
version: 1
stages:
  - id: problem
    title: 问题定义
    goal: 明确要解决的真实问题
    probes:
      - id: ex-p1
        question: 这个需求解决的是谁的什么问题？不做的代价是什么？
        allow_open: true
        options:
          - { label: 能挂到业务指标, value: business, recommended: true }
          - { label: 只有定性判断, value: qualitative }
  - id: solution
    title: 方案探讨
    goal: 对比方案优劣
    probes:
      - id: ex-s1
        question: 有没有比"新开发"更简单的办法？
        allow_open: true
        options:
          - { label: 配置/开关即可, value: config }
          - { label: 复用现有能力改造, value: reuse, recommended: true }
          - { label: 必须新开发, value: build }
  - id: compliance
    title: 合规审查
    goal: 检查合规/法务/安全风险
    probe_ref: compliance
  - id: scope
    title: 范围界定
    goal: 确定 MVP 与灰度
    probes:
      - id: ex-c1
        question: 哪些进本期、哪些放二期？
        allow_open: true
---

# 阶段集说明：示例

用几段话说明这套阶段集与默认 `standard` 的差异，以及在什么场景下应该选它。
例如：去掉取舍阶段、增加技术评审阶段的适用条件。
