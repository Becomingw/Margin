# Margin changelog

## [Unreleased]

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
