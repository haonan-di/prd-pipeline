---
name: _example
type: diagrams
description: 声明式引擎示例（文件名以 _ 开头，不会被扫描启用）
version: 1
engines:
  - name: plantuml
    source_format: plantuml
    strategies: [remote]
    options:
      encode: deflate+base64url
      remote_url: "https://www.plantuml.com/plantuml/svg/{encoded}"
---

# 声明式图表引擎示例

本文件演示「用户不写代码即可接入新画图工具」：在 frontmatter 里声明
`source_format` + `strategies` + `options.encode` + `options.remote_url` 即可。

把本文件复制到你自己的预设目录并去掉文件名前缀 `_`（例如 `extra.md`），
再用 `prd/preset.list` 应能看到该引擎；调用 `prd/diagram.build` 时用 `engine: plantuml` 选中它。

内置代码适配器（mermaid、drawio 等）优先级更高；同名时以内置为准。
