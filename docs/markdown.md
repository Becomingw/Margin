# Markdown 阅读支持

基础增强阅读自 **v0.2.0** 起提供；MathJax 兼容增强和选区按钮修复自 **v0.2.1** 起提供。
阅读视图保留源码选区映射；v0.3.0 新增 Plate / Slate 正文富文本编辑。

## 直接编辑正文（v0.3.0）

打开 Markdown 后点击 **直接编辑正文**，即可在排版后的正文中输入，使用工具栏
调整粗体、斜体、删除线、行内代码、标题、列表、链接与表格。支持撤销／重做；
点击 **保存正文**、按 Ctrl/Cmd+S 或使用桌面保存菜单，将草稿保存为一条修订。
打开编辑器、移动光标和切换原稿／修订视图不会改写文件，切换视图保留草稿。

- 未修改块直接复用原始源码；普通文字替换和增加强调优先映射到原始字符范围。
  结构性修改只序列化受影响的块，其中的 Markdown 写法可能规范化。
- 保留 BOM、换行和块间内容；文件外部变化时拒绝过期保存，并保留本地草稿。
- 已保存正文支持选区批注、批注高亮和导航。草稿尚未保存时先保存，再创建批注
  或采纳 Agent 建议，避免把新文字锚定到旧版本。
- MathJax 公式、图片、任务框、脚注、HTML、front matter 以及无法可靠映射的结构
  以保真的源码块保留显示，使用 **编辑此块源码** 修改。复杂公式不会降级。
- 粘贴采用纯文本，不导入网页 HTML 或远程资源。编辑状态下链接用于文字编辑；
  结束编辑后可在阅读视图打开链接。

这是限定在正文区的 React 19 + Plate 53 / Slate 编辑器。现有 markdown-it / parse5
继续负责保真阅读、历史版本和源码映射；没有把整篇原稿交给编辑器重新序列化。
开发环境 `npm ci` 自动执行编辑器本地构建，修改 `editor/` 后运行
`npm run build:editor`。发行内容包含本地 bundle 和第三方许可证，不请求 CDN。

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
- 任务框只读，编辑源码中的 `[ ]` / `[x]` 后更新。

解析使用本地 markdown-it、markdown-it-footnote 和 parse5；新版 Markdown 公式使用本地
MathJax，LaTeX 阅读视图继续使用 KaTeX。
无需云端服务、CDN、账号或模型配置。

## Verification

`npm test` checks source tiling, mapping, sanitization and review round trips.
`npm run test:markdown` checks actual Chromium rendering, table/HTML/entity edits,
comments, original view, local navigation, images, mobile layout and package restoration.
`npm run test:desktop` checks the Electron shell and external-link scheme boundary.
`npm run test:editor` checks real Plate editing, exact saves, selection comments,
undo/redo, composition input, tables, retained drafts, MCP feedback and conflicts.
