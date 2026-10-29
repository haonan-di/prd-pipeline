---
# 合规依据源模板 —— 复制到 <preset_dirs>/compliance/<依据名>.md
#
# 作用：审查阶段按 applies_to 匹配后，把这些条款叠加进语义清单。
#      domain 领域红线与人设方法论也会一并叠加，三者互不替代。
#
# 字段说明
#   name         必填。依据标识（如 c-end-privacy、b-end-data-export）
#   type         必填。固定为 compliance
#   applies_to   匹配条件，全部满足才生效；留空表示对所有需求生效
#                  product_form: c-end | b-end
#                  domain:       领域标识（与 domain 预设的 name 对齐）
#                  jurisdiction: 辖区（如 cn、eu）
#   probes       本依据的审查探针，合规阶段会自动叠加
#
# 写法要点：每条要能判断"做了没有"，不要写"应当充分保护用户权益"这类无法验证的话。
name: example-compliance
type: compliance
description: 示例合规依据 —— 说明它约束哪类产品、哪类环节
version: 1
applies_to:
  product_form: c-end
probes:
  - id: ex-c1
    question: 是否在收集前完成告知与单独同意？拒绝后能否继续使用非必要功能？
    allow_open: true
  - id: ex-c2
    question: 是否存在默认勾选、捆绑同意或一揽子授权？
    allow_open: true
    options:
      - { label: 无, value: clean, rationale: 合规底线 }
      - { label: 有, value: risk, rationale: 违规，需整改 }
---

# 合规依据：示例依据

## 一、适用范围

说明这份依据约束什么产品形态、什么业务环节。

## 二、条款清单

| 编号 | 要求 | 判断标准（可验证） | 对应探针 |
|------|------|--------------------|----------|
| C1 | 明示告知 | 首次收集前展示，且可回看 | ex-c1 |
| C2 | 单独同意 | 独立勾选，不与主协议捆绑 | ex-c2 |

## 三、常见违规形态

- 把同意藏在隐私政策里一句话带过。
- 拒绝授权即无法使用核心功能（超出必要范围）。

## 四、与其他依据的关系

写明与领域红线、行业法规的重叠与差异，避免重复堆叠。
