<p align="center"><img src="public/brand.svg" width="96" height="96" alt="Margin 程序图标"></p>
<h1 align="center">Margin · 页边</h1>
<p align="center"><strong>让想法，留在页边。</strong><br>安静地阅读，认真地批注。从第一份草稿，到下一轮更好的表达。</p>
<p align="center">
  <a href="https://github.com/Becomingw/Margin/releases/tag/v0.1.0">下载 v0.1.0</a> ·
  <a href="README.md">English</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="https://github.com/Becomingw/Margin/issues">反馈建议</a>
</p>
<p align="center"><code>Markdown + LaTeX</code> &nbsp; <code>本地优先</code> &nbsp; <code>人工审阅</code> &nbsp; <code>MIT</code></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/review-markdown-dark.png">
  <img src="docs/images/review-markdown-light.png" alt="Margin 审阅界面：暖白正文、文档侧栏与页边批注" width="100%">
</picture>

**Margin 是独立的本地 Markdown / LaTeX 审阅工作区。**
保留正文原始格式，把反馈放在页边，将完整审阅历史带到下一轮。
无需账号、云服务、模型或 API Key，也没有内置 AI 执行功能。

## 把精力留给文档

| 阅读 | 批注 | 修订 | 交接 |
| --- | --- | --- | --- |
| 打开 `.md`、`.tex` 或整个项目，按大纲浏览正文与公式。 | 对选区、段落或全文留言，回复、解决和重新打开问题。 | 编辑原始源码，记录修改理由，对比版本或恢复旧稿。 | 导出审阅包，在另一个工作区恢复，接续相同 ID 与历史。 |

- **正文保持干净。** 批注独立存储，不往源码插入审阅标记。只有明确的作者操作才会修改正文。
- **每一轮都有来处。** 保存版本、批注编辑、回复和状态变化都有记录；开始新一轮也不会清空历史。
- **适合长时间阅读。** 暖白纸面、克制的紫色强调、安静的侧栏，配套深色主题与窄屏布局。
- **从桌面自然开始。** 原生文件选择、拖放、最近项目、持久化导入工作区。安装版内置 Node。

## 下载

| 平台 | v0.1.0 安装包 |
| --- | --- |
| macOS · Apple Silicon | [下载 DMG](https://github.com/Becomingw/Margin/releases/download/v0.1.0/Margin-0.1.0-mac-arm64.dmg) |
| macOS · Intel | [下载 DMG](https://github.com/Becomingw/Margin/releases/download/v0.1.0/Margin-0.1.0-mac-x64.dmg) |
| Windows · x64 | [下载安装程序](https://github.com/Becomingw/Margin/releases/download/v0.1.0/Margin-0.1.0-win-x64.exe) |

macOS ZIP 与 SHA-256 校验和见[发布页](https://github.com/Becomingw/Margin/releases/tag/v0.1.0)。
**v0.1.0 安装包未签名，macOS 版本未公证**，系统可能提示开发者身份无法验证。
macOS 将 Margin 拖入「应用程序」；Windows 运行当前用户安装程序即可。
LaTeX 工具为可选项，不随应用附带。

<details>
<summary><strong>打开工作区，从这里开始</strong></summary>
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/desktop-home-dark.png">
  <img src="docs/images/desktop-home.png" alt="Margin 桌面首页：打开文档、打开项目、新建工作区、接续一次审阅" width="100%">
</picture>
</details>

## 快速开始

源码运行需要 **Node.js 20+**：

```sh
git clone https://github.com/Becomingw/Margin.git
cd Margin
npm ci
npm run desktop
```

如果偏好浏览器，运行 `npm run demo`，打开终端显示的本地地址即可。
演示使用虚构论文的临时副本，退出后自动清理。

在浏览器中打开自己的文档：

```sh
npm run setup -- /path/to/document-or-project --no-compile --json
npm run doctor -- --json
npm start
```

路径可以是 `.md`、`.tex` 或项目文件夹。多文件项目可补充 `--main main.tex`
或 `--main notes.md`。配置与私有审阅状态分别写入 `.margin.json` 和 `.margin/`。
**打开项目原地编辑；导入创建独立副本。**

## 从初稿到下一轮

1. **打开阅读**：选择文档，通过大纲定位。
2. **留下反馈**：选中一段话批注，或添加全文意见。
3. **认真修改**：保存源码时填写理由，可关联对应批注。
4. **查看差异**：在正文、源码级修订与本轮原稿之间切换。
5. **交给下一位**：导出审阅包，在另一个工作区恢复并继续。

<details>
<summary><strong>LaTeX 与 Markdown，享有同等审阅能力</strong></summary>
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/review-latex-dark.png">
  <img src="docs/images/review-latex-light.png" alt="LaTeX 正文、章节大纲与锚定批注" width="100%">
</picture>
</details>

### 带得走的审阅记录

`.marginreview` / ZIP 审阅包包含原稿、当前正文、支持的资源文件、便于阅读的
`REVIEW.md`，以及结构化批注、修订和事件。`review/state.json` 是完整恢复依据；
导入保留文档、版本、批注与事件 ID。

协作者或外部 Agent 无需运行 Margin，也能阅读其中的反馈。导入恢复完整快照，
单独修改 `REVIEW.md` 不构成可应用补丁；相同 ID 的重复导入会被拒绝，不自动合并分支。
审阅包包含**已删除批注与历史版本**。

## v0.1 的边界

- Markdown 支持常见结构、公式及源码位置映射，并非完整 CommonMark/HTML 渲染器；未识别语法保持可见。
- LaTeX 是基于源码的阅读视图，不是排版 PDF 编辑器。可选本地 PDF 编译通过 API 使用，暂未放入审阅工具栏。
- 非 UTF-8 文件只读。审阅包压缩前后均限制为 **32 MiB**。
- 保留兼容性 AI 适配代码，但模型执行路由返回 **410**。旧审阅数据可按[迁移说明](docs/migration.md)继续使用。

## 开发与文档

```sh
npm test                         # 语法检查、便携验证、Node 测试
npx playwright install chromium # 首次安装浏览器
npm run screenshots              # 浏览器回归与虚构文档截图
npm run test:desktop             # 真实 Electron 验证
```

原生 DOM、ES modules、本地 Node 服务；KaTeX 是唯一运行时库。
Electron 与 Playwright 用于开发和分发，无前端构建步骤。

| 使用指南 | 技术参考 |
| --- | --- |
| [配置](docs/configuration.md) | [HTTP API](docs/api.md) |
| [桌面打包](docs/desktop-packaging.md) | [审阅包格式](docs/review-package.md) |
| [Agent 安装指南](docs/INSTALL-FOR-AGENTS.md) | [LaTeX 约定](docs/latex-conventions.md) |
| [设计规范](DESIGN.md) | [安全说明](SECURITY.md) |
| [贡献指南](CONTRIBUTING.md) | [更新记录](CHANGELOG.md) |

---

<p align="center">在阅读与重写之间，留一点思考的空间。<br><a href="LICENSE">MIT 许可证</a> · <a href="NOTICE.md">源码归属</a> · <a href="THIRD_PARTY.md">第三方许可</a></p>
