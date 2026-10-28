---
name: iteration
type: template
description: 迭代 PRD 模板 —— 仅描述增量变更，关联父文档
version: 1
placeholders:
  - { key: background, label: 变更动因, required: true }
  - { key: changes, label: 本次变更范围, required: true }
  - { key: detail, label: 变更详述, required: true }
  - { key: grayscale, label: 灰度方案, required: false }
  - { key: compliance, label: 合规/风险, required: false }
  - { key: regression, label: 回归测试建议, required: false }
---

# {{title}} (v{{version}} 迭代)

> 本文档为迭代版本，仅描述增量变更；完整流程参见父文档。

## PRD 修订记录

| 版本 | 时间 | 修订内容 | 修订人 |
|------|------|---------|--------|
{{changelog_table}}

---

## 一、变更动因

{{background}}

---

## 二、本次变更范围

{{changes}}

---

## 三、变更详述

{{detail}}

{{#grayscale}}

---

## 四、灰度方案

{{grayscale}}
{{/grayscale}}

{{#compliance}}

---

## 五、合规/风险

{{compliance}}
{{/compliance}}

{{#regression}}

---

## 六、回归测试建议

{{regression}}
{{/regression}}
