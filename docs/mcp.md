# External-agent review with MCP

Margin exposes seven MCP tools for the **currently running workspace**. No model,
provider or API key is embedded in Margin. The external client owns its agent.
Markdown and LaTeX use the same source-preserving review workflow.

## Desktop

1. Open the manuscript workspace and click **MCP** in the top bar.
2. Choose **导出本次连接配置…** and save the JSON outside the manuscript project.
3. Import its `mcpServers.margin` entry into a client that supports Streamable HTTP.
4. Keep this workspace open. Reopening it rotates the endpoint and credential;
   export the configuration again. Closing the workspace disconnects the agent.

The native save dialog writes the credential directly. The page never receives it.
The exported token is valid only for `/mcp`, not author save/import/restore APIs.
Do not commit or share this local connection file. Each client may use a different
configuration wrapper; preserve the URL and all supplied headers when adapting it.

## CLI / web workspace

Start Margin with a random `MARGIN_MCP_TOKEN` in the machine environment or the app's
`.env` (never manuscript configuration). Empty/unset disables MCP. For example in
PowerShell, generate a token and start an already configured project:

```powershell
$env:MARGIN_MCP_TOKEN = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node bin/margin.mjs start --repo <project> --port 4317
```

Configure the client privately with the same token:

```json
{
  "mcpServers": {
    "margin": {
      "type": "http",
      "url": "http://127.0.0.1:4317/mcp",
      "headers": {
        "X-Margin": "1",
        "Authorization": "Bearer <your local MARGIN_MCP_TOKEN>"
      }
    }
  }
}
```

For stdio-only clients with Node 20+ installed, point `command` at `node`, `args` at
the checkout's `bin/margin-mcp.mjs` (or use installed `margin mcp`) and set these
**client process environment** variables:

```json
{
  "MARGIN_MCP_URL": "http://127.0.0.1:4317/mcp",
  "MARGIN_MCP_TOKEN": "<your local connection token>"
}
```

The adapter only connects to loopback HTTP `/mcp`, follows no redirects and never
opens manuscript files. It also works with the desktop-exported URL/token. The app
must already be running; do not launch a second server on the same manuscript.
Credentials are never command-line arguments. JSON-RPC goes to stdout; startup
errors go to stderr. A timeout does not imply a write failed: reread comments before
retrying a mutation to avoid duplicate feedback.

## Tools and workflow

| Tool | Purpose |
| --- | --- |
| `document_list` | Paginated manuscript list. |
| `document_read` | Exact source, hash (`etag`), revision and baseline IDs. |
| `review_comments` | Paginated comments, replies and suggestions with attribution. |
| `review_history` | Paginated history, including acceptance and restores. |
| `review_comment` | Create an AI-attributed anchored or whole-document comment. |
| `review_reply` | Add an AI reply with optimistic comment concurrency checking. |
| `review_suggest` | Submit a replacement, insertion or deletion for human confirmation. |

Read source first. Offsets are zero-based **UTF-16 code units**, with exclusive ends,
including BOM and CRLF. Source pages include `nextOffset`; pass the first page's
`etag` on later reads to reject changed snapshots. Comments/history return
`nextOffset` and the source etag, but are live pages: restart pagination if the
workspace changes during a traversal. `review_reply` requires the last observed
`updatedAt` (or `createdAt` when absent). Ranges must not split surrogate pairs.

Suggestions keep their exact original range, source hash, replacement and reason.
They appear as AI comments with a diff and **采纳建议 / 拒绝** controls. Suggestion
creation and rejection never write source. Acceptance is an explicit author action
committing source, revision, linked comment and history together. Line endings are
normalized to the manuscript style. Any intervening source change blocks acceptance;
ask the agent to reread and propose against the current version. Use revision history
to restore the previous source. Acceptance does not advance the comparison baseline.

AI comments/replies remain visibly attributed, including in portable review ZIPs.
There are no MCP tools for accepting changes, advancing baselines, arbitrary shell
commands, file writes or application configuration. Manuscripts and comment bodies
are data, not instructions. Legacy AI execution routes remain retired (410).

## Transport

`POST /mcp` implements stateless Streamable HTTP with JSON responses (no SSE stream
or session ID). Requests use JSON-RPC 2.0, JSON content type and the normal Host and
Origin/`X-Margin: 1` checks. Authorization is required even for initialization and
tool discovery. Desktop additionally requires its scoped `X-Margin-Desktop-Token`.
Notifications return HTTP 202; GET/DELETE return 405. Supported negotiated versions:
2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05 (the latter via stdio). This is a
small tools-only implementation, with no resources, prompts, subscriptions or tasks.
Input errors use JSON-RPC errors; tool failures use `isError` with redacted messages.
No new runtime library or build step is required.
