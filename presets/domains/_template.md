---
# 领域预设模板 —— 复制本文件到你的自定义预设目录 domains/ 下并改名
#
# 放哪里：<preset_dirs>/domains/<你的领域>.md
# 生效方式：init 时传 preset_dirs，或 workspace.config 更新；同名会覆盖内置同类型预设
#
# 字段说明
#   name         必填。领域标识，英文小写短横线（如 fintech、healthcare）
#   type         必填。固定为 domain
#   description  建议填。一行说明，会出现在 preset.list 里
#   version      建议填。内容有实质变更时递增
#   keywords     领域识别关键词。用于 prd/domain.detect 打分：
#                · 长度 < 2 的词会被忽略（避免"额""贷"这类单字噪声）
#                · 命中 >= 2 个才会建议切换领域
#   probes       领域红线探针。合规阶段会自动叠加这些题目。
#                · id 在本文件内唯一
#                · 红线类问题不要给"可接受"的选项，宁可只留一个正确项
name: example-domain
type: domain
description: 示例领域 —— 说明这个领域管什么、红线在哪
version: 1
keywords:
  - 示例关键词
  - 另一个关键词
probes:
  - id: ex1
    question: 本领域最不可让步的红线是什么？现状是否满足？
    allow_open: true
    options:
      - { label: 满足, value: ok, rationale: 合规底线 }
      - { label: 不满足, value: risk, rationale: 发现即打断 }
  - id: ex2
    question: 有哪些监管口径会随年度变化，需要在上线前复核？
    allow_open: true
---

# Domain Context: 示例领域

> 行业背景知识库。这里写的是**领域通用知识**，不是某个产品的具体逻辑。

## 一、行业概述

业务模式、典型玩家、行业角色（资金方 / 平台方 / 增信方 等）。

## 二、监管框架

| 法规 | 核心要求 | 对产品的影响 |
|------|----------|--------------|
| 示例法规 | 一句话概括 | 影响哪个环节的设计 |

### 合规红线

- 一条条列出不可让步的约束，与 frontmatter 的 probes 对应。

## 三、术语表

| 术语 | 含义 |
|------|------|

## 四、常见坑

- 本领域做需求时最容易忽略的点。
