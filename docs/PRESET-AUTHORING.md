# 自定义预设编写指南（M3）

内置预设覆盖了通用场景，但行业知识、公司条款、团队方法论这类内容只有你自己有。自定义预设就是把这些东西沉淀成可复用的资产。

---

## 一、目录结构

自定义预设目录与内置 `presets/` 结构一致，六类各一个子目录：

```
my-presets/
├── domains/       行业知识与红线
├── souls/         人设与方法论
├── templates/     PRD 模板
├── compliance/    审查依据源
├── stages/        讨论阶段集
└── diagrams/      图表引擎声明
```

每类都有一份 `_template.md` 可复制（文件名以 `_` 开头，不会被当成可用预设，但可以用 `preset.validate` 校验）。

## 二、挂到工作区

```json
{ "preset_dirs": ["D:/my-presets"] }
```

通过 `prd/workspace.init` 或 `prd/workspace.config` 写入。可以给多个目录，**后面的覆盖前面的**，所有自定义都覆盖内置。

目录不存在或没有六类子目录时，`preset.list` 与 `workspace.init` 都会给出 `warnings`，不会静默跳过。

## 三、覆盖内置

覆盖键是 `type + name`。例如在 `domains/fintech.md` 里写 `name: fintech`，内置的金融领域就被替换。

覆盖后：

- `preset.list` 里该项 `source: "custom"`、`overrides_builtin: true`；
- `summary.overridden_builtin` 汇总所有被覆盖的项，用来确认"到底哪些内置失效了"。

建议覆盖前先用 `prd/preset.get({name, type})` 把内置那份读出来当底稿，改而不是从零写。

## 四、六类分别写什么

| 类型 | 关键字段 | 写作要点 |
|------|----------|----------|
| `domain` | `keywords`、`probes` | 关键词长度 ≥ 2（单字会被忽略）；红线探针不要给"可接受"的选项 |
| `soul` | — | 写可执行的取舍原则，不写"要专业"这类空话；审查阶段会拿它当语义清单 |
| `template` | `placeholders` | 占位符与正文必须双向对齐；`title/version/date/changelog/author` 不用声明 |
| `compliance` | `applies_to`、`probes` | `applies_to` 全部满足才生效；每条要能判断"做了没有" |
| `stages` | `stages[]` | `id` 唯一且会进文件名；合规阶段用 `probe_ref: compliance`，不要重复抄题 |
| `diagrams` | `engines[]` | 声明 `remote` 策略必须给 `options.remote_url` |

## 五、校验

写完就跑校验，别等运行时：

```json
{ "dir": "D:/my-presets" }
```

整目录批量校验（推荐，社区分享前必跑）：

```
preset.validate({ dir }) →
{
  dir, scanned, valid,
  files: [ {file, type, valid, errors[], warnings[]} ],
  errors: [...], warnings: [...]
}
```

单文件调试：

```json
{ "path": "D:/my-presets/templates/iteration.md" }
```

### 错误 vs 告警

**错误**会让 `valid: false`，必须改：目录归属不符、占位符用而未声明、id 重复、remote 缺地址、schema 不合法。

**告警**不影响可用性，但通常值得改：文件名与 `name` 不一致、正文为空、占位符声明未用、未知 `probe_ref`、关键词过短。

## 六、常见报错对照

| 报错 | 原因 | 改法 |
|------|------|------|
| `文件位于 domains/ 目录，但声明 type: soul` | 放错子目录 | 移到 `souls/` |
| `正文使用了 {{xxx}}，但未在 placeholders 中声明` | 模板正文多写了占位符 | 补声明，或删掉正文里的 `{{xxx}}` |
| `占位符键重复` | 同一 key 声明两次 | 合并 |
| `阶段 id 重复` | 两个阶段用了同一个 id | 改成唯一 id |
| `声明了 remote 策略但没有 remote_url` | 图表引擎缺地址 | 补 `options.remote_url` |
| `name「a」与文件名「b」不一致` | 文件名没跟着 name 改 | 统一两者 |
| `以下关键词长度 < 2` | 单字关键词 | 换成 ≥2 字的词 |

## 七、分享给其他人

把整个目录推到一个仓库即可。对方只需要：

1. clone 下来；
2. `workspace.init` 传 `preset_dirs` 指向该目录；
3. 跑一次 `preset.validate({dir})` 确认在其环境下无错误。

内置的六份 `_template.md` 就是按这个标准写的，可以当作参考范例。
