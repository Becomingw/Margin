# Margin agent guide

## Installation

Read [docs/INSTALL-FOR-AGENTS.md](docs/INSTALL-FOR-AGENTS.md). Ask for a Markdown or
LaTeX document/project and whether to compile PDFs. Use this local checkout or
https://github.com/Becomingw/Margin. Node 20+ is required. No AI backend,
model or key is needed. Run setup and doctor with `--json`, start the server and
verify `/api/health`. Report the URL, checks and written files.

## Product and design

Margin · 页边 is an independent local manual-review workspace. Follow
[DESIGN.md](DESIGN.md). Markdown and LaTeX have equal status. Reviews live outside
source markup; portable ZIPs restore IDs, comments, revisions and complete history.
AI routes return 410. Attribution belongs in LICENSE and NOTICE.md, not product
navigation or support links. Legacy names are data-migration readers only.

## Invariants (do not break these)

1. Only explicit author actions write manuscript source: manual save, accepted
   legacy proposals, confirmed linked changes, tracked-change resolution, undo,
   structure-plan revert and explicit import. Agent execution never writes source.
2. Writes stay inside resolved `sourceRoot`, including symlinks; use `atomicWrite`
   and `withProjectLock`. Preserve source encoding, BOM and line endings.
3. Bind loopback by default. Only `MARGIN_HOST` overrides it, with a warning.
4. Every request passes the Host allow-list (421). Mutations need matching Origin
   or `X-Margin: 1` (403), and JSON content type (415). Desktop adds its private token.
5. Credentials come only from the machine environment or app `.env`, never project
   config. Strip from project children; redact traces/messages. No keys in argv.
6. A project cannot choose arbitrary commands or key destinations. Existing guards
   require explicit `MARGIN_ALLOW_*` switches outside project configuration.
7. No third-party browser requests. Serve scripts/fonts/styles locally under CSP.
8. No model IDs in code or presets. Retained adapters do not enable model execution.
9. No new runtime dependency or build step without discussion in an issue first.
10. Child prompts use stdin. No absolute machine paths or secrets in browser/model
    output. Native file dialogs may display local paths.

Read [SECURITY.md](SECURITY.md) before changing request handling, configuration,
path resolution or child processes. Report vulnerabilities privately.

## Code map

- `server.mjs`: parser, request security, review API, retained compatibility routes.
- `public/app.js`, `index.html`, `theme.css`, `review.css`: plain DOM review UI.
- `public/brand.svg`, `icons.svg`: original Margin brand and interface marks.
- `review-store.mjs`: identity, history, anchors, transaction recovery.
- `review-package.mjs`: versioned ZIP import/export and validation.
- `markdown.mjs`: source-preserving display and character mapping.
- `names.mjs`, `config.mjs`, `env.mjs`: namespace and validated local configuration.
- `desktop/`: sandboxed Electron launcher, native dialogs, managed workspaces.
- `bin/margin.mjs`, `scripts/setup.mjs`, `doctor.mjs`, `demo.mjs`: command entry points.
- `tests/`: node:test suites and fictional fixtures.

Do not split the server or app monolith as a side effect. Reuse existing helpers.
No framework, bundler or transpiler. KaTeX is the sole runtime library; Electron,
electron-builder and Playwright are development/distribution tools.

## Commands

```sh
npm ci
npm test
npm run demo
npm run setup -- /path/to/document-or-project --no-compile --json
npm run doctor -- --json
npm run screenshots
npm run desktop
npm run test:desktop
```

`npm test` runs syntax checks, portable smoke and all node:test suites. Test
servers use ephemeral ports, temporary `margin-` projects and `X-Margin: 1`.
No real provider or key. Set `MARGIN_ENV_FILE=none`; clean with `cleanupAll()`.
Regression fixes need a failing test. Parser edits need source-tiling and exact
round-trip checks. Suites run concurrently; do not share state between files.

Regenerate UI screenshots using `npm run screenshots` and `npm run test:desktop`,
then inspect them. Only fictional manuscripts. Install Chromium once with
`npx playwright install chromium`. Native icons derive from `public/brand.svg`
using `node scripts/desktop-icons.mjs`. Generate installers with `desktop:dist`
only for an explicit packaging or release request.

## Style and delivery

ES modules, plain modern JavaScript, 2 spaces, double quotes, semicolons and
trailing commas in multiline literals. Match neighboring code. Comments explain
why. Browser errors go through HttpError/errorResponse. User-facing text states
the next action plainly. Preserve unrelated work and source copyright notices.

Update docs/api.md for routes; docs/configuration.md, .env.example and
margin.config.example.json for settings. Keep CHANGELOG.md under Unreleased.
Run `npm test` before every PR and relevant UI checks. No manuscript data, keys,
private review state or machine-specific paths in committed artifacts. Commit
subjects are imperative and describe the change. Link any issue/PR actually
worked on to the user session as soon as its identity is known.
