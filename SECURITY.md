# Margin security

## Reporting

Report vulnerabilities through Margin's
[private reporting form](https://github.com/Becomingw/Margin/security/advisories/new).
Do not send security details to the public issue tracker. Use fictional documents;
exclude unpublished text, `.env`, credentials and `.margin/` contents.

## Local workspace boundary

Margin is for one author on a trusted computer. The ordinary CLI server binds
`127.0.0.1:4317` and is not a public hosting service. Only `MARGIN_HOST` can change
the binding; a non-loopback binding emits a warning. Generic `HOST` and legacy
product environment variables do not alter it.

Every request passes a Host allow-list. State-changing requests require a
matching Origin, or `X-Margin: 1` when Origin is absent, and JSON content. The
browser serves scripts, fonts and styles locally under a strict CSP.
Markdown and embedded HTML are parsed locally into an allow-listed element tree;
scripts, handlers, embeds and arbitrary styles are discarded. Remote images are
not requested. Local images use the existing source-root-confined asset endpoint.
Markdown formulas use a document-scoped MathJax context with safe filtering;
only allow-listed SVG geometry and local typography reach the renderer. TeX
cannot load external extensions, execute HTML or fetch remote images/fonts.

Only explicit author actions write source. Writes resolve symlinks, stay within
`sourceRoot`, are serialized and atomic. Interrupted review transactions recover
from a write-ahead journal; externally modified files are not overwritten during
recovery. UTF-8 source offsets and original bytes are retained.

## Review packages

Packages include all saved manuscript versions and complete comment history,
including deleted comments. Export only when intending to share that information.
Imports validate paths, sizes, checksums, version chains and anchors before
restoring into a fresh directory. No imported configuration or executable is run.
See [the package contract](docs/review-package.md).

## Desktop

The Electron launcher owns a private loopback utility process on an ephemeral
port. Every request requires a random per-launch token injected by the main
process. It is absent from renderer URLs/storage and stripped from project child
process environments. Renderers are sandboxed, context-isolated and have no Node
integration. Preload exposes specific workspace actions only; IPC verifies the
window and main frame. Navigation, permissions and network destinations are
restricted. Native exports cannot overwrite the active project's source/history.
An explicit link action permits only HTTP(S) and mailto URLs in the system handler;
file, data, JavaScript and custom protocol links cannot reach the native shell.

External-agent MCP uses a separate private per-workspace credential, accepted only
at `/mcp`. A native save dialog can export that connection; no credential is sent
to renderer scripts. The endpoint also requires Bearer authorization and the
normal Host, Origin and JSON checks. The CLI enables it only when the machine sets
`MARGIN_MCP_TOKEN`. Tokens are stripped from project children and redacted from
messages. MCP tools write attributed review metadata only; proposed source edits
require an explicit author acceptance with exact source/hash conflict checking.
The CLI's ordinary author API remains trusted-local, not a sandbox for arbitrary
external programs with filesystem or HTTP access.

## Configuration and optional processes

AI routes return 410; legacy configuration cannot enable model execution. API
keys are unnecessary. Retained compatibility code accepts keys only from the
machine environment or the app's `.env`, refuses credentials in project files,
strips keys from CLI/LaTeX/git children and redacts them from messages and traces.

Projects cannot choose arbitrary commands or key destinations. Overrides require
`MARGIN_ALLOW_*` switches outside the project. No credentials are passed in argv.
Optional LaTeX compilation executes local code: `latexmk` can read `.latexmkrc`,
and `make` runs a Makefile. Enable compilation only for trusted projects.

## Limits

The ordinary web/CLI API has no login. Another process on the same machine that
can reach it can make accepted requests. Desktop isolation adds a private token;
it is not a defense against a compromised operating-system account. Cloud or
multi-user hosting needs a separate authentication and storage architecture.

Maintain source copyright notices in [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
