---
# 图表引擎预设模板（声明式）—— 复制到 <preset_dirs>/diagrams/<你的引擎>.md
#
# 作用：不写代码就接入新的图表格式。声明 source_format 与远程渲染地址后，
#      prd/diagram.build 即可按该格式校验与出图。
#
# 字段说明
#   name          必填。本预设标识
#   type          必填。固定为 diagrams
#   engines       必填。可声明多个引擎
#     name          引擎名，diagram.build 的 engine 参数用它选择
#     source_format 源码格式名（如 plantuml、dot），用于校验与提示
#     strategies    支持的渲染策略（source | local | remote）
#     options       引擎参数，具体键由引擎决定；远程类引擎通常需要：
#                     encode       编码方式（如 deflate+base64url）
#                     remote_url   含 {encoded} 占位符的远程地址
#
# 注意：remote 策略会把图内容发给第三方，涉密场景请只用 source/local。
name: example-diagrams
type: diagrams
description: 示例图表引擎声明 —— 说明接入的是什么格式
version: 1
engines:
  - name: plantuml
    source_format: plantuml
    strategies: [remote]
    options:
      encode: deflate+base64url
      remote_url: "https://www.plantuml.com/plantuml/svg/{encoded}"
---

# 图表引擎：示例

说明这个引擎的适用场景、已知限制，以及与内置 mermaid 的差异。
例如：plantuml 适合时序与架构图，但依赖第三方渲染，涉密内容不要用 remote。
