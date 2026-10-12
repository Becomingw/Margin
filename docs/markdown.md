# Markdown 阅读支持

以下能力自 **v0.2.0** 起提供。
阅读视图与源码编辑分开：选区修订会显示对应的原始 Markdown，保存后重新渲染。

## 支持的语法

| 内容 | 阅读效果 |
| --- | --- |
| 标题 | ATX / Setext 标题、章节大纲、文内标题链接、重复标题编号 |
| 行内格式 | 粗体、斜体、嵌套强调、删除线、行内代码、反斜杠转义、HTML 实体 |
| 列表 | 有序与无序列表、嵌套列表、起始序号、只读任务复选框 |
| 表格 | 管道表格、表头、左/中/右对齐、单元格格式、横向滚动 |
| 引用 | 多层引用，NOTE / TIP / IMPORTANT / WARNING / CAUTION 提示块 |
| 代码 | 围栏和缩进代码块，保留空格与换行，显示围栏语言标记 |
| 链接 | 行内与引用链接、网址/邮件自动链接、文内锚点、相对 `.md` / `.tex` 文档链接 |
| 图片 | 项目内 PNG / JPEG / GIF / WebP / SVG，替代文本和标题 |
| 公式 | `$…$`、`$$…$$`、`\(…\)`、`\[…\]`，KaTeX 本地渲染 |
| 脚注 | `[^name]` 引用与定义、点击跳转；定义保留在源码对应位置 |
| 文档属性 | 文件开头的 YAML front matter 显示为可折叠代码 |
| 其他 | 分隔线、软换行、两个空格或反斜杠产生的硬换行 |

常用 HTML 经过允许列表处理，支持表格（含合并单元格）、`details` / `summary`、
`sub` / `sup`、`mark`、`kbd`、`br`、列表、引用和常见文字格式。
HTML 块内的 Markdown 遵循 CommonMark 行为，不保证再次解析。

## 批注与修订

- 表格单元格、链接文字、脚注正文和 HTML 文本均映射回源码，可选区批注和修订。
- 实体映射到完整源码：例如选中 `&`，修订框显示 `&amp;`；公式按完整公式处理。
- 跨格式或跨单元格选择的源码范围可能包含分隔符与标签，保存前可在修订框确认。
- 自动生成的标签没有源码范围；使用旁边的段落批注，或直接编辑全文源码。
- 保留 BOM、CRLF、Unicode、原始语法及审阅历史。源码不会因打开或阅读而被重写。
- 审阅包携带支持的本地图片；导入后仍可阅读、继续批注和修订。

## 使用边界

- 远程图片显示替代文本，不自动访问外部服务器。可把图片存入项目再使用相对路径。
- 外部网页/邮件链接仅在点击后打开；桌面版交给系统浏览器或邮件应用。
- HTML 脚本、事件、任意样式、iframe、嵌入媒体、交互表单和内联 SVG 不执行。
  SVG 文件作为受限图片显示。
- 代码块目前不做语法着色；Mermaid、PlantUML、MDX、插件组件与任意网页布局不渲染。
- 任务框只读，编辑源码中的 `[ ]` / `[x]` 后更新。这里不是所见即所得编辑器。

解析使用本地 markdown-it、markdown-it-footnote 和 parse5，公式使用本地 KaTeX。
无需云端服务、CDN、账号或模型配置。

## Verification

`npm test` checks source tiling, mapping, sanitization and review round trips.
`npm run test:markdown` checks actual Chromium rendering, table/HTML/entity edits,
comments, original view, local navigation, images, mobile layout and package restoration.
`npm run test:desktop` checks the Electron shell and external-link scheme boundary.
