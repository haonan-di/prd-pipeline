---
# 模板预设 —— 复制到 <preset_dirs>/templates/<你的模板>.md
#
# 关键约束（preset.validate 会检查）
#   · placeholders 里声明的每个 key，正文中必须出现 {{key}}（否则视为未使用）
#   · 正文里出现的每个 {{key}}，必须先在 placeholders 里声明（否则 generate 会报 PLACEHOLDER_UNRESOLVED）
#   · required: true 的键，generate 时必须提供（可为空串）
#   · 条件块写法 {{#key}}...{{/key}}：key 有非空内容时整块保留，否则整块删除
#
# 字段说明
#   name         必填。模板标识（如 standard、iteration、tech-design）
#   type         必填。固定为 template
#   description  建议填
#   placeholders key 用小写英文；label 是给人看的中文名
name: example-template
type: template
description: 示例模板 —— 说明这份 PRD 适用于什么场景
version: 1
placeholders:
  - { key: background, label: 需求背景, required: true }
  - { key: objectives, label: 目标与收益, required: true }
  - { key: details, label: 需求详述, required: true }
  - { key: risks, label: 风险与依赖, required: false }
  - { key: appendix, label: 附录, required: false }
---

# {{title}}

## 修订记录

| 版本 | 时间 | 修订内容 | 修订人 |
|------|------|---------|--------|
| v{{version}} | {{date}} | {{changelog}} | {{author}} |

---

## 一、背景

{{background}}

---

## 二、目标

{{objectives}}

---

## 三、需求详述

{{details}}

{{#risks}}

---

## 四、风险与依赖

{{risks}}
{{/risks}}

{{#appendix}}

---

## 五、附录

{{appendix}}
{{/appendix}}
