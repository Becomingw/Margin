# Margin changelog

## [Unreleased]

## [0.3.0] — 2026-10-17

- Add a scoped React / Plate / Slate Markdown editor (issue #6) with direct text
  editing, formatting, links, tables, undo/redo and explicit revision saves.
  Retain exact untouched source, mapped text edits, BOM/line endings and protected
  source blocks for MathJax, HTML and unsupported constructs.
- Keep rich-text drafts across review views, reject conflicting saves without
  discarding input, map clean selections to review anchors and preserve the native
  save/dirty-navigation workflow. Bundle editor assets and full licenses locally.
- Add external-agent MCP over stateless HTTP and a stdio adapter: paginated source,
  comments and history, attributed feedback, replies and proposed source changes.
  Desktop exports a scoped, per-workspace connection through a native dialog.
- Preview, accept or reject AI suggestions in the review sidebar. Human acceptance
  is atomic, stale source is rejected, baselines stay unchanged and ZIPs retain
  attribution, suggestions and complete history.
- Add collapsible navigation/review panes, comment search and previous/next
  navigation, active-card emphasis and a quieter manuscript toolbar. Keep review
  headings and filters visible while the comment list scrolls.
- Index comment highlight ranges once per snapshot instead of scanning every
  comment for every displayed character. Reject stale original-view responses
  during document switches and clear obsolete outlines in source-diff mode.
- Preserve the selected document when a previous write finishes late, reveal saved
  comments, and distinguish successful writes from failed follow-up refreshes.
- Verify the real Electron MCP workflow, including preserved author drafts,
  human acceptance/restore, per-workspace credential rotation and restart history.

## [0.2.1] — 2026-10-12

- Use local MathJax for Markdown formulas, including AMS environments, chemistry,
  physics, document-scoped macros and equation references. Keep formula source
  visible with an explanation when a command cannot be rendered.
- Preserve table cells and exact source spans around math pipes and TeX `\|`;
  support flexible display delimiters, standalone equation environments and math fences.
- Hide selection actions immediately when a selection is cleared, collapsed,
  moved outside the document or dismissed with Escape; show them on reselection.
- Build and smoke-test Intel macOS packages on native Intel runners rather than
  relying on cross-architecture application startup on Apple Silicon runners.
- Wait for document reload completion between browser smoke-test edits to avoid
  stale save notifications racing with DOM replacement on slower runners.
- Scope the MathJax XML dependency override to its dependency tree so macOS
  packaging retains its compatible property-list parser; add a packaging regression.

## [0.2.0] — 2026-10-12

- Expand Markdown reading with aligned tables, nested lists, task checkboxes,
  reference/autolinks, local images, footnotes, math, callouts, front matter and
  allow-listed HTML including tables and details. Preserve source-mapped selection
  comments/edits, original encoding and portable review history.
- Open relative document/heading links in the workspace and explicit external
  links in a separate browser. Keep remote images and active HTML disabled.
- Add rich Markdown browser regression coverage and light/dark/mobile screenshots.
- Refocus the bilingual README on review features and everyday workflows, simplify
  setup guidance and add acknowledgments to Paper Pal and its contributors.

## [0.1.0] — 2026-10-12

### Independent identity

- Adopt Margin · 页边, an original page-margin mark, new app/CLI identities and
  the `.margin` / `MARGIN_*` namespace. Remove inherited repository, support and
  release metadata; preserve source attribution in LICENSE and NOTICE.md.
- Read earlier review packages and workspace data without losing IDs or history.
  Document migration separately from the current product configuration.

### Interface

- Redesign the reading workspace and desktop home with warm paper surfaces,
  compact navigation, a quieter review inspector and a restrained purple accent.
- Share visual tokens and local fonts across both surfaces; support light/dark
  themes, keyboard focus, reduced motion and narrow-screen layouts.
- Group import tools in the sidebar and place stable record IDs under disclosure.

### Manual review core

- Support Markdown and LaTeX equally for opening, importing, source edits and
  review packages. No built-in model execution; AI routes return 410.
- Track comments, replies, status changes, source revisions and complete event
  history. Preserve original sources, stable anchors and review-round baselines.
- Restore portable ZIP packages and continue editing. Validate package contents
  before writing; recover interrupted saves without overwriting external edits.
- Provide an optional Electron launcher with native dialogs, recent workspaces,
  isolated local services and unsaved-editor prompts.
- Publish the independent repository, illustrated bilingual documentation and
  original multi-resolution macOS / Windows application icons.

Upstream provenance and license: [NOTICE.md](NOTICE.md), [LICENSE](LICENSE).
