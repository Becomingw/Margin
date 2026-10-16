# Local HTTP API

## External-agent MCP

`POST /mcp` is an opt-in stateless Streamable HTTP MCP endpoint. It requires
`Authorization: Bearer <MARGIN_MCP_TOKEN>` plus the Host, Origin/`X-Margin: 1`
and JSON checks below. The desktop-scoped token is also sent as
`X-Margin-Desktop-Token`; that credential is accepted only at `/mcp`.
Initialization, ping, tool discovery and seven review tools are supported.
Notifications return 202, GET/DELETE return 405. See [MCP](mcp.md) for schemas,
client setup, paging and author-confirmed modification workflow.

`POST /api/review/suggestion-resolve` is an author-only action with
`{ id, action: "accept" | "reject", expectedUpdatedAt, etag }`. Acceptance requires
both the supplied etag and the suggestion's original hash to match current source.
It commits source, linked revision, comment status and history atomically. Rejection
does not require `etag` and does not write source. Both return the refreshed review.
Missing suggestions return 404; stale/already resolved proposals return 409.
The normal `GET /api/review` response includes optional comment `actor` and
`suggestion: { text, etag, status, appliedRevision? }` fields; replies/events also
carry source attribution. `GET /api/bootstrap` reports `mcp.enabled` and a relative
endpoint, never the credential.

## Author API

Base URL: `http://127.0.0.1:4317`, or the printed port. Internal API, unstable
before 1.0. The server is loopback-only by default and has no authentication.

The optional desktop shell starts a separate server with `MARGIN_DESKTOP_TOKEN`.
In that mode every request additionally needs `X-Margin-Desktop-Token`; the
Electron main process injects it. The token is not available to renderer scripts.
The ordinary CLI/web server does not set it and retains its existing contract.

Every request passes the Host allow-list (421 otherwise). Non-GET/HEAD requests
require a matching Origin or `X-Margin: 1` (403). Bodies must be JSON objects
with `Content-Type: application/json` (415). Normal body limit is 2,000,000 bytes;
import allows 46,976,205 bytes of JSON to carry base64 for a 32 MiB archive.
The page has a strict CSP; asset responses have a sandboxing CSP.

Errors are `{ "error": "message" }`: 400 invalid input/package, 403 confinement
or origin failure, 404 missing file/route, 409 stale source/comment or identity
conflict, 410 retired AI feature, 413 size limit, 422 invalid legacy save text,
500 unexpected failure. Browser-facing errors redact machine paths and secrets.

## Reading

| GET | Result |
|---|---|
| `/api/health` | `ok`, app name/version, project title/entry, both `formats`, `reviewPackageVersion: 1`, `agent: {enabled: false}`, LaTeX capability. |
| `/api/bootstrap` | Title, config filename, entry/initial file, document list, supported formats/package version, disabled agent, compile status. |
| `/api/document?path=…` | Exact source, SHA-256 `etag`, encoding/read-only flags, source-mapped display blocks and references. |
| `/api/review?path=…` | Project ID, document with all revisions, comments and event history for the document. Detects and records external source changes. |
| `/api/review/render?path=…&revision=…` | Display payload for a stored revision, without changing the current source. |
| `/api/review/export` | Complete ZIP download (`application/zip`); synchronises current sources first. |
| `/api/events` | SSE; `ready`, `review`, `document`, plus compatibility events. Reload rather than silently replacing an unsaved draft. |

Paths are relative to the configured project and confined to `sourceRoot` after
resolving symlinks. New review documents must end in `.md` or `.tex`.

Markdown blocks include an allow-listed `tree` of `{tag, attrs, children}` nodes.
Text leaves carry `text`, `from`/`to` offsets into `block.display`, and `mapped`.
`displayStarts`/`displayEnds` map each UTF-16 display code unit to a block-relative
source span (end exclusive); `null` means generated/unmapped content and must not
be used as a selection endpoint. Decoded entities can share a complete source span.
Math and image nodes are atomic and retain their source range. Markdown math
nodes now include `svg` (an allow-listed MathJax geometry tree) or `error` (a
readable diagnostic); `latex` remains the original formula content. Clients
create SVG elements from the tree rather than injecting arbitrary HTML.
Hidden structure
blocks preserve gaps so concatenating every block's `raw` exactly restores source.
Historical revision rendering uses the same structure. See [Markdown support](markdown.md).

## Review writes

Every route below is POST, returns 200 JSON and uses the project lock.

### `/api/review/save`

`{path, etag, text, start?, end?, reason?, commentIds?}`.
With `start`/`end`, replace that source range. Without them, replace the complete
source. Offsets are zero-based UTF-16 code units, end exclusive. Empty replacement
deletes the range. An unchanged source creates no revision. Requires the current
etag. Returns the updated review payload.

### `/api/review/comment`

`{path, etag, start, end, body, heading?}`. Source range and body are required;
`start: 0, end: 0` is a document-wide comment. Returns the new comment with stable
ID, original quote/context/version and current anchor.

### `/api/review/comment-update`

`{id, expectedUpdatedAt, action, body?}`. `expectedUpdatedAt` is the comment's
`updatedAt`, or its `createdAt` before the first update. Actions: `edit`, `reply`,
`resolve`, `reopen`, `delete`, `restore`. Edit/reply require a nonempty body.
Returns the updated comment. Deletion is recorded, not erased.

### `/api/review/restore`

`{path, etag, revisionId, reason?}`. Restore a saved revision as a **new** revision;
history remains intact. Returns the updated review payload.

### `/api/review/checkpoint`

`{path, etag, label?}`. Move this document's review baseline to its current revision
and append an event. Returns the updated review payload.

### `/api/review/import`

Either `{package: "<base64 ZIP>"}` or
`{files: [{path: "notes.md", content: "<base64 bytes>"}, …]}`.
At least one Markdown/LaTeX document is required. Supported companion resources
are `.bib`, `.sty`, `.cls`, common image formats and PDF. All files are validated
before a transaction writes into a fresh `imports/review-…/` folder. Returns
`{documents: [{id, path}, …]}`. No overwrite or automatic identity merge.
See [review-package.md](review-package.md) for the graph and round-trip contract.

Example (replace etag with the value returned by `/api/document`):

```sh
curl -s http://127.0.0.1:4317/api/review/comment \
  -H 'X-Margin: 1' -H 'Content-Type: application/json' \
  -d '{"path":"main.tex","etag":"CURRENT_ETAG","start":0,"end":0,"body":"Check the evidence."}'
```

## Retired AI routes

`/api/rewrite`, `/api/request/*`, `/api/requests`, `/api/chat`, `/api/chat/*`,
`/api/chats`, `/api/document/review*`, and `/api/structure/section-rewrite` return
410. Old project settings cannot enable them. Setup and doctor never call models.

## Retained local compatibility routes

These support existing local scripts and old state. The new review page uses the
review routes above. Manuscript writes also enter the new revision history.

| Route | Purpose |
|---|---|
| GET `/api/outline` | Compiled LaTeX outline or Markdown headings. |
| GET `/api/structure`, `/api/structure/plan` | Existing structure and stored plan. |
| POST `/api/structure/confirm`, `/api/structure/mark-applied`, `/api/structure/revert` | Store/update/revert an explicit manual structure plan; no agent rewrite. |
| GET/POST `/api/undo` | Inspect/apply the legacy undo stack. New review restores use revision IDs. |
| POST `/api/save` | Legacy block edit with path, etag, blockIndex/blockId, baseText and text. |
| POST `/api/tracked-change/resolve` | Explicitly accept/reject an embedded LaTeX tracked-change group. |
| POST `/api/confirm`, `/api/unconfirm` | Legacy passage-reading confirmations. |
| GET/POST `/api/compile` | Read status/start optional configured LaTeX compiler. |
| GET `/api/git` | Local git status. |
| GET `/api/pdf` | Configured project PDF. |
| GET `/api/asset?path=…`, `/api/asset-preview?path=…` | Confined local manuscript assets/previews. |
| GET `/vendor/katex/*` | Bundled math renderer. |

Source and review metadata use atomic writes with a write-ahead recovery record.
A pending save that conflicts with externally modified files blocks recovery
instead of overwriting those files.
