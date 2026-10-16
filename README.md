<p align="center"><img src="public/brand.svg" width="96" height="96" alt="Margin icon"></p>
<h1 align="center">Margin · 页边</h1>
<p align="center"><strong>A little room for thought.</strong><br>Read closely. Leave a note. Make the next draft better.</p>
<p align="center">
  <a href="#download-and-get-started">Download</a> ·
  <a href="#from-reading-to-handoff">Explore features</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="https://github.com/Becomingw/Margin/issues">Feedback</a>
</p>
<p align="center"><code>Markdown + LaTeX</code> &nbsp; <code>Local review</code> &nbsp; <code>Complete history</code> &nbsp; <code>Portable feedback</code></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/review-markdown-dark.png">
  <img src="docs/images/review-markdown-light.png" alt="Margin: document navigation on the left, a reading surface in the center, and anchored comments on the right" width="100%">
</picture>
<p align="center"><sub>The document takes center stage. Your thoughts live in the margins. Light and dark themes for every draft.</sub></p>

**Margin is a local document-review workspace for Markdown and LaTeX.**
Bring reading, feedback, editing and version history together—from a first paper
draft to a polished technical document. Your manuscript keeps its original format;
review records live alongside it. No account, cloud service or AI setup required.

**New in v0.3.0:** direct Markdown editing with Plate / Slate, external-agent MCP,
and faster, more stable review navigation. [Release notes](docs/releases/v0.3.0.md).

## From reading to handoff

External agents can connect through the **MCP** button to read manuscripts, review
comments/history, add attributed feedback and propose edits. Authors preview and
accept suggestions as tracked revisions. Desktop exports a scoped connection;
CLI supports HTTP and stdio. See [MCP setup](docs/mcp.md).

### Read with room to think

Open a single document or a multi-file project. Find your place with the section
outline, read text and formulas in the reading view, and move into source editing
whenever you need to.

- **Two formats, one workflow.** Read, annotate, revise and export both Markdown and LaTeX.
- **Richer Markdown reading.** Tables, nested lists, task lists, links,
  local images, footnotes, math and common HTML—including collapsible details—keep
  their structure while you review. See the [support guide](docs/markdown.md).
- **Stay oriented in long documents.** Switch files and navigate headings as you check one section against another.
- **An interface that steps back.** Warm paper, quiet controls, dark mode and narrow-screen layouts leave room for the text.

<details>
<summary><strong>See the LaTeX reading view</strong></summary>
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/review-latex-dark.png">
  <img src="docs/images/review-latex-light.png" alt="LaTeX reading view with section navigation and comments in the margins" width="100%">
</picture>
</details>

<details>
<summary><strong>See richer Markdown rendering</strong></summary>
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/markdown-rich-dark.png">
  <img src="docs/images/markdown-rich-light.png" alt="Markdown tables, nested formatting and source-anchored review comments" width="100%">
</picture>
</details>

### Give every comment a place

Select a sentence for a precise suggestion, discuss a whole paragraph, or leave a
document-wide note. Feedback stays connected to the relevant text without filling
your source with review markers.

| What you want to do | How Margin helps |
| --- | --- |
| Point out a specific issue | Selection comments preserve the quoted passage so you can return to the source. |
| Work through a suggestion | Replies keep follow-up explanations in the same discussion. |
| Keep track of open questions | Filter unresolved comments, resolve them and reopen when needed. |
| Revisit earlier feedback | Comment edits, deletions and restorations remain in the history. |

### Revise with the reason attached

The Markdown editor uses **Plate / Slate** in a scoped React island.
Choose **直接编辑正文** to type into the rendered manuscript, format text and edit
tables. Save explicitly to record a revision. Source-aware edits preserve untouched
blocks; formulas and unsupported structures retain their source-edit fallback.
See [editing and compatibility](docs/markdown.md). `npm ci` builds the local editor;
run `npm run build:editor` after changing `editor/`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/plate-editor-dark.png">
  <img src="docs/images/plate-editor-light.png" alt="Plate Markdown editor with formatting, tables and source-anchored comments" width="100%">
</picture>

Make a local replacement or edit the full source. When saving, add a reason and
optionally link a comment—keeping what changed connected to why it changed.

- **Current / Changes / Original.** Move between the latest text, source-level differences and the starting point of the review round.
- **A way back, without losing the trail.** Restoring an earlier version creates another revision and preserves the existing record.
- **A fresh round, a continuous history.** Update the comparison baseline while keeping previous edits and discussions.

<details>
<summary><strong>See changes against the original</strong></summary>
<br>
<img src="docs/images/review-markdown-changes.png" alt="Markdown revision view showing inserted and deleted source text" width="100%">
</details>

### Hand off the context, too

Export a review package for a collaborator, or continue on another computer.
Import it to restore the connected manuscript, comments, replies, versions and
history. Keep editing, then pass the next round along.

> **Take more than the latest draft. Take the path that led to it.**

Packages include original and current sources, supported resources, a readable
`REVIEW.md` and structured records. Collaborators or external agents can read the
feedback without running Margin. When all you need is the manuscript, export the
current document on its own.

### Open a local workspace and begin

Native file dialogs, drag-and-drop and recent projects make it easy to start or
pick up where you left off. New and imported workspaces stay on your computer
across restarts. Unsaved-edit prompts help you avoid losing work when switching
documents or closing the app.

**Opening edits a project in place; importing creates a separate copy.**
Continue working on your own manuscript, or keep an incoming document or review
package in its own workspace.

## Made for these moments

| Scenario | A way to use Margin |
| --- | --- |
| Reviewing your own paper | Read once to flag gaps in reasoning and expression, then revise one comment at a time. |
| Working with an advisor or co-author | Exchange review packages that carry feedback, replies and editing reasons together. |
| Refining technical documentation | Keep Markdown in its original format and compare changes across review rounds. |
| Working with an external agent | Connect through MCP to read, comment and propose edits; review each suggestion before accepting it. |

## Download and get started

| Platform | v0.3.0 installer |
| --- | --- |
| macOS · Apple Silicon | [Download DMG](https://github.com/Becomingw/Margin/releases/download/v0.3.0/Margin-0.3.0-mac-arm64.dmg) |
| macOS · Intel | [Download DMG](https://github.com/Becomingw/Margin/releases/download/v0.3.0/Margin-0.3.0-mac-x64.dmg) |
| Windows · x64 | [Download installer](https://github.com/Becomingw/Margin/releases/download/v0.3.0/Margin-0.3.0-win-x64.exe) |

1. **Install Margin.** On macOS, drag it to Applications; on Windows, run the installer. No separate Node installation needed.
2. **Open a document or project.** Choose a `.md`, `.tex` or folder, drag it in, or import a review package you received.
3. **Leave your first note.** Select text to comment, save your edits and revisit them in the changes view.

macOS ZIPs, checksums and verification details are on the [release page](https://github.com/Becomingw/Margin/releases/tag/v0.3.0).
Current builds are unsigned and macOS builds are not notarized; your system may display an unidentified-publisher prompt.

<details>
<summary><strong>A few things to know</strong></summary>

- Margin focuses on manual review. There is no built-in AI execution and no model or API key to configure.
- Markdown supports direct rich-text editing with explicit saves. Complex formulas,
  HTML and unsupported structures keep source-edit fallbacks; see the [support guide](docs/markdown.md).
  LaTeX is a source-preserving review view, not a typeset PDF editor.
- Non-UTF-8 files remain read-only. Review packages are limited to 32 MiB compressed and expanded, and include earlier versions and deleted comments.
- Packages restore complete reviews; they do not automatically merge branches with the same IDs. Editing `REVIEW.md` alone does not create an importable patch.
- For the local browser version or source installation, see the [installation guide](docs/INSTALL-FOR-AGENTS.md). Existing users can follow the [migration guide](docs/migration.md).

</details>

## Acknowledgments

Margin grew out of [Paper Pal](https://github.com/claire1217/paper-pal).
Thank you to [claire1217](https://github.com/claire1217) and the original project's
contributors for sharing their work and laying the foundation for local document
review, LaTeX reading and an author-controlled editing workflow.

Building on that foundation, Margin focuses on **manual review for both Markdown
and LaTeX, with complete history that travels with the document**, under its own
identity, interface and desktop application. Thanks also to
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md) for the design
references. The original MIT copyright and license notices are preserved in
[LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

---

<p align="center">Made for the space between reading and rewriting.<br><a href="CHANGELOG.md">Changelog</a> · <a href="CONTRIBUTING.md">Contribute</a> · <a href="docs/configuration.md">Configuration</a> · <a href="LICENSE">MIT License</a> · <a href="THIRD_PARTY.md">Third-party notices</a></p>
