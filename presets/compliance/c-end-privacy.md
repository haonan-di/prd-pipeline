---
name: c-end-privacy
type: compliance
description: C 端隐私合规依据源 —— 个保法要点（收集最小化/明示授权/权限时机/第三方SDK/注销删除/未成年人/个性化关闭）
version: 1
applies_to: { product_form: c-end }
probes:
  - id: cp1
    question: 本次需求收集了哪些个人信息？是否满足最小必要？
    allow_open: true
    options:
      - { label: 未新增任何收集, value: none, rationale: 最省事，先确认 }
      - { label: 新增收集，且与功能直接相关, value: related, rationale: 需写明用途与留存期 }
      - { label: 新增收集，相关性存疑, value: questionable, rationale: 可能违反最小必要，需砍 }
  - id: cp2
    question: 收集前是否有明示告知与单独同意（非捆绑）？
    allow_open: true
    options:
      - { label: 单独弹窗征得同意, value: separate, rationale: 推荐 }
      - { label: 与主协议打包同意, value: bundled, rationale: 存在合规风险 }
  - id: cp3
    question: 权限申请时机是否"用时才申请"？
    allow_open: true
    options:
      - { label: 用到时才申请, value: on-demand, rationale: 推荐 }
      - { label: 启动即申请, value: at-launch, rationale: 易被判定过度索权 }
  - id: cp4
    question: 是否涉及第三方 SDK？是否在隐私政策中披露？
    allow_open: true
  - id: cp5
    question: 账号注销与个人数据删除权是否可用？
    allow_open: true
  - id: cp6
    question: 是否涉及未成年人？是否有个性化推荐且可关闭？
    allow_open: true
---

# C 端隐私合规要点（审查依据源）

> 本文件是**可维护的审查依据源**：公司可把自己的合规政策作为自定义文件放进来，审查环节会自动叠加。

- 收集最小必要：只收集与功能直接相关、且用户可预期的最小集合。
- 明示授权：收集前告知用途，敏感信息需单独同意，禁止捆绑同意。
- 权限时机：用时才申请，禁止启动即索权。
- 第三方 SDK：逐一披露目的与数据字段，禁止超范围共享。
- 用户权利：提供账号注销与个人数据删除路径，且真实可用。
- 未成年人：涉及未成年人需监护人同意与专门保护。
- 个性化推荐：提供关闭选项。
