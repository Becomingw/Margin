# MCP and review interaction verification

## 2026-10-16 · Windows development checkout

Reference study: Edda's review workspace, indexed decorations, attributed review
operations and MCP tool contracts. Margin retains plain DOM, local assets and its
author-confirmed source-write model. No runtime dependency or build step was added.
All verification uses fictional manuscripts and temporary projects.

### Automated checks

- `npm test`: 48 syntax checks, portable smoke, 148 passing node:test cases,
  5 existing platform/legacy skips, no failures.
- `npm run test:review-ui`: real Chromium transport/UI flow, including an AI
  suggestion, source unchanged before acceptance, author acceptance, comment
  search/navigation and pane collapse. Delayed mutation responses preserve a newly
  selected document; a successful save followed by a failed reload shows a visible
  saved-but-refresh-failed message instead of an error inside a closed form.
- `npm run test:desktop`: real Electron 44.7.0 on Windows. Native connection export,
  MCP initialization/discovery, AI suggestion creation while an author draft is open,
  human acceptance and exact BOM/CRLF restore pass. Workspace switches rotate tokens;
  old credentials cannot access the new workspace. ZIP handoff, restart persistence,
  both manuscript formats, sandboxing, dirty navigation and service cleanup pass.
  First-use binary download required `ELECTRON_GET_USE_PROXY=1` on this machine.
- `npm run screenshots`: Markdown and LaTeX selection mapping, comments/replies,
  exact CRLF saves, diff/original views, mobile width, ZIP handoff and continued
  review. Light/dark/mobile screenshots regenerated and visually inspected.
- `npm run test:markdown`: rich tables/HTML/entities, nested source mappings,
  formula rendering, local navigation, mobile and package image restoration pass;
  regenerated rich Markdown and formula screenshots inspected.
- MCP HTTP and stdio tests cover initialization, tool discovery, exact paged
  source, metadata paging, attribution, concurrent feedback, stale sources and
  comments, BOM/emoji boundaries, acceptance/restore and portable state validation.
  Request guards, scoped desktop credential rejection at author endpoints,
  child-environment stripping and redaction are also exercised.

### Reproduced display regression

`node scripts/review-interactions.mjs --baseline` serves the original `HEAD` app
bundle while using the fixture server. Delay the second document's load, request
the first document's original view, then deliver that original response last.
The original app displays “First document” under the second document's identity.
The fixed app rejects the response by render generation and document identity.
The same regression script verifies source-diff mode clears stale outline links.

A second delayed-response regression first failed by navigating from `first.md`
back to `second.md` after accepting a suggestion. Mutation refresh now checks the
original document and navigation generation. The native test also reproduced the
review header scrolling away (58 px) when revealing a comment; the sidebar now
scrolls only its card list, keeping headings, tabs and filters available.

### Highlight microbenchmark

On Node 24.8.0, query 100,000 single-character source spans against 1,000 comments
at `[i * 100, i * 100 + 20)`. Both algorithms mark exactly 20,000 characters:

| Algorithm | One measured run |
| --- | --- |
| Original per-character `comments.some` | 76.69 ms |
| Merged intervals + binary search | 2.45 ms |

This isolates highlight lookup, not total rendering time. Non-monotonic mappings,
nested/overlapping comments and exclusive range boundaries have independent tests.

### Scope

MCP handles external feedback and proposed edits. Human acceptance is still required
for source changes, and baselines remain author-controlled. Connection configuration
is described in [mcp.md](mcp.md). No real provider, manuscript or credential was used.
