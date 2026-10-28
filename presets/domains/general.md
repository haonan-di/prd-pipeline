---
name: general
type: domain
description: 通用（不绑定特定行业的默认领域）—— 无行业红线，仅兜底通用常识
version: 1
keywords: []
probes:
  - id: g1
    question: 这个需求是否涉及**行业特定的合规/监管约束**？若有，应补一个领域预设或告知具体行业。
    allow_open: true
    options:
      - { label: 无行业特定约束, value: none, rationale: 保持 general 即可 }
      - { label: 有，我知道是哪个行业, value: known, rationale: 建议补/切换到对应领域预设 }
      - { label: 不确定, value: unsure, rationale: 需在合规阶段展开追问 }
  - id: g2
    question: 这个需求是否涉及**用户个人信息**？（与合规依据源联动）
    allow_open: true
    options:
      - { label: 涉及, value: yes, rationale: 合规阶段会加载隐私依据源 }
      - { label: 不涉及, value: no }
---

# Domain Context: General（通用）

> 这是**默认领域**：不绑定任何行业，不提供行业专属红线或术语。
>
> 当需求不属于任何内置/自定义领域时选它即可——它是**刻意的选择**，而非"没有领域"。
> 若需求涉及特定行业（金融、医疗、教育…），应改用对应领域预设，以加载该行业的监管红线与术语。

通用常识（任何领域都成立）：

- 需求要解决的是**真实问题**，不是功能清单；
- 目标必须**可量化**，否则无法验证；
- 方案要**可执行、可验收**，并配套异常流程；
- 涉及个人信息的，合规阶段会叠加隐私依据源（见 `presets/compliance/`）。
