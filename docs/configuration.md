# Configuration

`npm run setup -- <document-or-project>` writes `.margin.json`. Either Markdown
or LaTeX can be the entry document. Configuration is loaded once at startup.

```json
{
  "title": "My review",
  "sourceRoot": ".",
  "defaultDocument": "notes.md",
  "latex": { "enabled": false },
  "agent": { "enabled": false },
  "ui": { "initialDocument": "notes.md", "hiddenDocuments": [] }
}
```

| Field | Meaning |
|---|---|
| `title`, `projectLabel` | Local workspace labels. |
| `sourceRoot` | Readable/writable manuscript tree, relative to the project; default `.`. Symlinks are checked against the resolved root. |
| `defaultDocument` | Existing `.md` or `.tex` entry file inside the source root. |
| `ui.initialDocument` | Initially selected file; defaults to `defaultDocument`. |
| `ui.hiddenDocuments` | Paths excluded from the document list. |
| `pdf` | Project-relative output PDF path. |
| `latex.enabled` | Optional compilation API; disabled for Markdown entry documents. |
| `latex.cwd`, `command`, `args` | Local compilation configuration; defaults to the entry directory and `latexmk`. |
| `agent.enabled` | Always false in this version, even if an old project sets true. |
| `approvedDocuments` | Legacy paragraph confirmation defaults. |

Old provider fields are still validated for compatibility. They cannot enable
model execution. No model ID or key is needed. Credential-like values in a
project configuration remain rejected. Project-controlled command and URL guards
remain active; see [SECURITY.md](../SECURITY.md).

## Files and project selection

- Project: `--repo`, then `<app>/margin.local.json`, then current directory.
- Config: `--config`, otherwise `<project>/.margin.json`. Older workspaces have
  read fallbacks documented in [migration](migration.md).
- State: `.margin/review.json` plus a write-ahead `review-pending.json` during
  saves. The existing `.draft-review/` directory is reused if appropriate.
- Legacy confirmation, undo, proposal and chat files are retained on disk.
  They are not automatically migrated into the new history.
- Imports: `imports/review-…/` below `sourceRoot`, never over existing files.
- Setup remembers the project in the app directory unless `--no-remember` is used.

State contains manuscript text and deleted comments; it is ignored by git. Export
is an explicit author action and includes the complete review history.

## Setup flags

```sh
npm run setup -- /path/to/project --main notes.md --no-compile
npm run setup -- /path/to/paper.tex --no-compile
```

`--source`, `--title`, `--main`, `--compile`/`--no-compile`, `--force`,
`--no-remember`, `--json` and `--yes` are supported. `--provider`, `--model`,
`--chat-model` and `--review-language` are accepted as legacy flags but ignored.
If multiple entry candidates exist, setup lists them and exits 5; choose `--main`.
Both `main.md` and `main.tex` in one directory also require an explicit choice.

## Machine settings

Port: `--port`, then `MARGIN_PORT`, then 4317. Port 0 selects a free port.
Bind address: `MARGIN_HOST`, then `127.0.0.1`;
generic `HOST` is ignored. Non-loopback binding prints a warning.

The app's `.env` is read; a manuscript's `.env` is never read. Set
`MARGIN_ENV_FILE=none` to disable loading it. Shell values take precedence.
No new environment variables are required by the review workspace.

Desktop: `MARGIN_DESKTOP_DATA_DIR` selects a separate app-data directory.
`MARGIN_DESKTOP_TOKEN` is generated internally for each backend and must not be
set in project configuration. The desktop launcher always uses loopback, a free
port and `MARGIN_ENV_FILE=none`. See [desktop packaging](desktop-packaging.md).
