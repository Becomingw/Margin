# Install the manual review workspace

Ask for the document/project path and whether optional LaTeX PDF compilation is
wanted. Markdown and LaTeX are equal entry formats. **Do not ask for an AI backend,
model or key**: this version performs manual review only.

Use this checkout outside the manuscript repository, with Node.js 20 or newer.
For a fresh installation, clone `https://github.com/Becomingw/Margin.git`.
From the application directory:

```sh
npm ci
```

Use the user's path in place of `<document-or-project>`:

```sh
npm run --silent setup -- "<document-or-project>" --no-compile --json
npm run --silent doctor -- --json
npm start
```

For a folder with several entry candidates, add `--main <file.md|file.tex>`.
Use `--compile` instead of `--no-compile` only when the user requests LaTeX
compilation. Markdown entry projects do not compile PDFs.

Setup never prompts. Exit codes:

| Code | Action |
|---|---|
| 0 | Continue to doctor. JSON reports `mode: "manual-review"`, formats, paths and next commands. |
| 2 | Correct the usage error. |
| 3 | Confirm the document/project exists. |
| 4 | Ask for the entry document; pass `--main`. |
| 5 | Show the candidate list and ask the user to choose. |
| 6 | Read the existing configuration; do not overwrite it without authorization. |

Doctor returns 0 if local requirements pass, 1 otherwise. Fix failed checks and
run it again. Legacy `--ping` is ignored and never contacts a model provider.

Verify the running app (use the port printed in the terminal):

```sh
curl -s http://127.0.0.1:4317/api/health
```

Expect `ok: true`, `agent.enabled: false`, `formats: ["markdown", "latex"]` and
`reviewPackageVersion: 1`. Report the URL, local checks and writes:

- `<project>/.margin.json` and private `.margin/` state;
- `<app>/margin.local.json`, unless `--no-remember`;
- no manuscript edits until the author's explicit save or restore action.

For a review ZIP, start a configured workspace and use **Import review package**.
It restores into a fresh folder. See [review-package.md](review-package.md) for
identity preservation, limits and the difference between restoration and merging.
