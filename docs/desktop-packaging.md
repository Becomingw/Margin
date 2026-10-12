# Margin desktop development

Download builds from [GitHub Releases](https://github.com/Becomingw/Margin/releases).
v0.2.1 provides macOS Apple Silicon / Intel and Windows x64 installers. They are
unsigned; macOS builds are not notarized. Use `npm run desktop` for development.

The desktop packaging request authorizes an optional Electron distribution layer.
Electron and electron-builder are development/packaging dependencies only; the web
server uses KaTeX, MathJax, markdown-it, markdown-it-footnote and parse5, with no bundler
and no compilation step.
The existing web/CLI commands remain usable without Electron.

The desktop main process owns native file dialogs, recent projects, local export
destinations and a private backend utility process. Renderers are sandboxed, with
Node integration disabled and a small context-isolated preload API. A random
per-launch backend token is injected by the main process, never put in renderer
URLs or storage. Each server binds loopback on an ephemeral port.
Explicit clicks on HTTP(S) or mail links open the system browser/mail app through
a scheme-validated preload action; the review renderer itself cannot navigate away.

Opening edits a selected project in place. Unconfigured projects get a minimal
manual-review configuration, with compilation off. Importing a review package
creates a separate managed workspace under the app's user-data directory; source,
resources and review identities are restored together. Existing project configs
are never overwritten by opening a file. Closing or switching a dirty editor asks
whether to discard; closing the app stops its private backend.

Development: `npm ci`, then `npm run desktop`.
Unpacked build: `npm run desktop:pack`.
Installers: `npm run desktop:dist -- --mac --arm64`, `--mac --x64`, or `--win --x64`.
Use each platform's native build runner; the workflow builds both platforms.
Intel macOS packages use `macos-15-intel`; Apple Silicon uses `macos-latest`.
The workflow checks the packaged executable as well as development Electron.
Artifacts appear in `dist/`. The Windows installer is per-user and preserves user
data on uninstall. `.marginreview` files are ZIP review packages; ordinary exported
`.zip` packages can also be imported. Markdown/LaTeX default file associations are
not changed.

Public releases should be signed. electron-builder reads `CSC_LINK` and
`CSC_KEY_PASSWORD` for certificates. macOS notarization uses `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`, or Apple's API-key variables
supported by electron-builder. Without credentials, local artifacts are unsigned
test builds; producing them does not certify Windows execution or Apple notarization.
Releases are uploaded explicitly with the GitHub CLI; no automatic updater is enabled.

`MARGIN_DESKTOP_DATA_DIR` optionally selects an isolated absolute user-data
directory (useful for testing). Packaged apps need neither Node nor npm on the
user's machine. LaTeX is optional and is not bundled. Desktop startup ignores
project-selected environment files and inherited AI credentials.
