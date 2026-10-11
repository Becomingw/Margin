# Contributing to Margin

Margin is a local manual-review workspace for Markdown and LaTeX. Read
[AGENTS.md](AGENTS.md), [DESIGN.md](DESIGN.md) and [SECURITY.md](SECURITY.md).

From this checkout, using Node.js 20 or newer:

```sh
npm ci
npm test
npm run demo
```

Use fictional documents when reporting bugs. Never include unpublished text,
review-state files or credentials. Use [GitHub Issues](https://github.com/Becomingw/Margin/issues)
for bugs and suggestions; share security reports through the
[private form](https://github.com/Becomingw/Margin/security/advisories/new).

Keep each change focused. Preserve source-root confinement, atomic writes,
explicit-author-action semantics, local-only rendering and complete review
history. Do not add a runtime dependency or a build step without discussion in
an issue first. A bug fix needs a failing regression test. Update changed APIs,
configuration and the changelog. Run `npm test`, plus `npm run screenshots` for
browser UI changes and `npm run test:desktop` for desktop behavior.

Tests use Node's built-in runner, temporary projects and local servers. The
browser and desktop checks use Playwright. Run a single suite with
`node tests/run.mjs review`. No live AI service is part of the test workflow.

Contributions are licensed under [MIT](LICENSE). Keep the required attribution
in [NOTICE.md](NOTICE.md). Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
