---
name: standard
type: template
description: 标准 PRD 模板 —— 背景/目标/详述/灰度/合规/附录
version: 1
placeholders:
  - { key: background, label: 需求背景, required: true }
  - { key: objectives, label: 目标和收益, required: true }
  - { key: details, label: 需求详述, required: true }
  - { key: grayscale, label: 灰度方案, required: false }
  - { key: compliance, label: 合规/风险披露, required: true }
  - { key: appendix, label: 附录, required: false }
---

# {{title}}

## PRD 修订记录

| 版本 | 时间 | 修订内容 | 修订人 |
|------|------|---------|--------|
{{changelog_table}}

---

## 一、项目/需求背景

{{background}}

---

## 二、目标和收益

{{objectives}}

---

## 三、需求详述

{{details}}

{{#grayscale}}

---

## 四、灰度方案

{{grayscale}}
{{/grayscale}}

---

## 五、合规/风险披露

{{compliance}}

{{#appendix}}

---

## 六、附录

{{appendix}}
{{/appendix}}
