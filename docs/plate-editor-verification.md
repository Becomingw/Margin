# Plate editor migration verification

## Scope · 2026-10-16

Issue [#6](https://github.com/Becomingw/Margin/issues/6) records the dependency/build
discussion and approval. The Markdown editor uses React 19.3.1, Plate 53.3.11,
the Plate Markdown/GFM, basic-node, list, code and table plugins, and local esbuild.
The rest of the workspace remains plain DOM. The existing source-mapped reading
and historical renderer remains available.

## Source contract

Opening the editor never writes a manuscript. Identical drafts return the original
source verbatim. Text edits and added emphasis use source offsets where possible;
structural changes serialize only affected blocks. Untouched blocks, separators,
BOM, entities and line endings retain their original source. Structural edits can
normalize Markdown spelling inside the changed block. Complex math, images, HTML,
front matter, tasks, footnotes and uncertain mappings retain a source-edit fallback.

Rich text is a local draft until an explicit save through the existing etag/atomic
review API. Dirty drafts survive view switches and incoming MCP feedback. A stale
save keeps the draft; navigation asks before discarding. Clean selections map to
source anchors and comment highlights; save dirty drafts before adding comments or
accepting suggested source changes.

## Checks

All checks below passed on Windows: `npm test` reports 52 syntax checks, portable
smoke, 156 passing cases, 5 existing platform/legacy skips and no failures.

- `tests/editor-source.test.mjs`: exact untouched round trips; BOM/CRLF/emoji and
  entity preservation; localized formatting and table edits; insert/delete blocks;
  retained delimiters and document-scoped reference fallback.
- `npm run test:editor`: real Chromium editing and source assertions, reverse
  selection comments, comment highlights, formatting, undo/redo, view/document
  switching, table-cell edits, link creation, pure-text paste, table insertion/rows,
  CDP composition input, incoming MCP feedback, conflicting saves and draft retention.
  Checks page errors and rejects every non-local browser request.
- `npm run test:desktop`: real Windows Electron editor, native save menu, canceled
  dirty navigation, exact source save, review ZIP handoff and restart persistence.
- Existing `test:review-ui`, `test:markdown` and `screenshots` cover both manuscript
  formats, historical rendering, source selection, formulas, safe HTML and ZIPs.
- `npm test` also rebuilds the editor and checks syntax, portable behavior and the
  complete Node regression suite.

The browser tests caught and fixed initialization entering undo history, deferred
Slate selection handling, incorrect decoration/element attribute contracts and an
invisible character inserted by default Markdown empty-paragraph serialization.
Release CI additionally exposed new-table focus returning to the preceding paragraph.
This was reproduced with `MARGIN_EDITOR_CPU_RATE=6` in the Chromium smoke test;
table insertion now selects its first cell and toolbar commands synchronize the
visible selection before applying transforms. The throttled regression passes.

Screenshots: `docs/images/plate-editor-{light,dark,mobile}.png` and
`docs/images/desktop-plate-editor.png`. Fixtures are fictional; no manuscript or
credential is included. The npm distribution includes the generated bundle and full
third-party license manifest. Editor dependencies are development dependencies;
the browser runs their bundled code without installing a new backend service.
