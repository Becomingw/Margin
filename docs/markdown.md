# Markdown 阅读支持

基础增强阅读自 **v0.2.0** 起提供；MathJax 兼容增强和选区按钮修复自 **v0.2.1** 起提供。
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
| 公式 | `$…$`、`$$…$$`、`\(…\)`、`\[…\]`；新版使用 MathJax 本地渲染 |
| 脚注 | `[^name]` 引用与定义、点击跳转；定义保留在源码对应位置 |
| 文档属性 | 文件开头的 YAML front matter 显示为可折叠代码 |
| 其他 | 分隔线、软换行、两个空格或反斜杠产生的硬换行 |

常用 HTML 经过允许列表处理，支持表格（含合并单元格）、`details` / `summary`、
`sub` / `sup`、`mark`、`kbd`、`br`、列表、引用和常见文字格式。
HTML 块内的 Markdown 遵循 CommonMark 行为，不保证再次解析。

## 向 Typora 对齐的公式兼容（v0.2.1）

Typora 使用 MathJax，v0.2.0 的 Margin 使用 KaTeX，因此同一段 LaTeX 可能有不同结果。
新版 Markdown 阅读改用本地 MathJax 3，并扩展了公式分块：

- 多行或同一行的 `$$…$$` / `\[…\]`，以及 `math` 围栏。
- 独立的 `equation`、`align`、`alignat`、`gather`、`multline`、`eqnarray` 环境及星号变体。
- 公式内部的矩阵、分段函数、AMS / mathtools 命令、`\ce` 化学式、`\dv` 等 physics 命令。
- `\newcommand` / `\def` 定义限于同一文档；切换文件或历史版本后重新构建。
- `\label`、`\tag`、`\ref` / `\eqref`（含前向引用），采用 AMS 环境编号规则。
- 表格内的 `$P(A|B)$`、`$|x|$`、`$\|v\|$` 保留为同一单元格，不损失反斜杠。
- 无法渲染的公式保留源码，显示「公式未渲染」并提供错误提示，仍可选中修订。

行内 `$…$` 遵循 Typora 当前默认的 Pandoc 风格规则：开头不紧跟空白，结尾不紧邻
前导空白或后续数字；代码中的公式标记保持原样。MathJax 也不是完整 LaTeX 编译器，
不支持任意宏包、文件读写或 HTML 指令；Typora 的可选插件与偏好设置也可能带来差异。
参照：[Typora 数学文档](https://support.typora.io/Math/)。

若普通管道表格仍显示源码，请同时检查前后的代码围栏、HTML 块和缩进，并确认应用版本。
孤立表格可以正确解析，不代表嵌入完整原文时的块上下文相同。

## 批注与修订

- 表格单元格、链接文字、脚注正文和 HTML 文本均映射回源码，可选区批注和修订。
- 实体映射到完整源码：例如选中 `&`，修订框显示 `&amp;`；公式按完整公式处理。
- 跨格式或跨单元格选择的源码范围可能包含分隔符与标签，保存前可在修订框确认。
- 自动生成的标签没有源码范围；使用旁边的段落批注，或直接编辑全文源码。
- 保留 BOM、CRLF、Unicode、原始语法及审阅历史。源码不会因打开或阅读而被重写。
- 审阅包携带支持的本地图片；导入后仍可阅读、继续批注和修订。
- 取消选区、点到别处或按 Esc 后，选区按钮隐藏；再次选中正文后重新出现。

## 使用边界

- 远程图片显示替代文本，不自动访问外部服务器。可把图片存入项目再使用相对路径。
- 外部网页/邮件链接仅在点击后打开；桌面版交给系统浏览器或邮件应用。
- HTML 脚本、事件、任意样式、iframe、嵌入媒体、交互表单和内联 SVG 不执行。
  SVG 文件作为受限图片显示。
- 代码块目前不做语法着色；Mermaid、PlantUML、MDX、插件组件与任意网页布局不渲染。
- 任务框只读，编辑源码中的 `[ ]` / `[x]` 后更新。这里不是所见即所得编辑器。

解析使用本地 markdown-it、markdown-it-footnote 和 parse5；新版 Markdown 公式使用本地
MathJax，LaTeX 阅读视图继续使用 KaTeX。
无需云端服务、CDN、账号或模型配置。

## Verification

`npm test` checks source tiling, mapping, sanitization and review round trips.
`npm run test:markdown` checks actual Chromium rendering, table/HTML/entity edits,
comments, original view, local navigation, images, mobile layout and package restoration.
`npm run test:desktop` checks the Electron shell and external-link scheme boundary.
