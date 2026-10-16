# Third-party software and fonts

Margin is released under the [MIT License](LICENSE); source attribution is in
[NOTICE.md](NOTICE.md). It uses the
following third-party components. Each stays under its own licence.

## KaTeX

- Use: renders math in the LaTeX reading view, installed
  by `npm install` into `node_modules/katex` (version range `^0.18.1` in
  `package.json`) and served from there under `/vendor/katex/`. It is not
  copied into this repository.
- Licence: MIT. Copyright (c) 2013-2020 Khan Academy and other contributors.
  Full text: `node_modules/katex/LICENSE`.
- The KaTeX distribution includes the KaTeX fonts
  (`node_modules/katex/dist/fonts`). The KaTeX project publishes them under the
  SIL Open Font License 1.1 (https://github.com/KaTeX/katex-fonts).
- Source: https://github.com/KaTeX/KaTeX

## MathJax

- Use: typesets Markdown mathematics locally in the Node backend as restricted SVG.
  MathJax 3 supports the math family documented by Typora, including AMS, mhchem,
  physics, macros and equation references. No CDN or dynamic extension downloads.
- Package: `mathjax-full` 3.2.2. Licence: Apache-2.0; see
  `node_modules/mathjax-full/LICENSE` and bundled component/font notices.
- Source: https://github.com/mathjax/MathJax-src
- MathJax's transitive XML parser is constrained to the patched `@xmldom/xmldom`
  0.9.12 series or newer compatible versions through a `speech-rule-engine`-scoped
  override, preserving the macOS packager's separate compatible parser. Rendering uses
  MathJax's lightweight adaptor rather than an XML DOM or speech engine.

## Markdown and HTML parsing

- **markdown-it**: CommonMark parsing and tables/strikethrough, with local source
  mapping hooks. MIT; see `node_modules/markdown-it/LICENSE`.
  Source: https://github.com/markdown-it/markdown-it
- **markdown-it-footnote**: reference footnotes. MIT; see
  `node_modules/markdown-it-footnote/LICENSE`.
  Source: https://github.com/markdown-it/markdown-it-footnote
- **parse5**: HTML fragment parsing and source locations before allow-list
  sanitization. MIT; see `node_modules/parse5/LICENSE`.
  Source: https://github.com/inikulin/parse5

These run in the local Node backend, without browser CDNs or a build step.
Their transitive dependencies retain their own notices in `node_modules`.

## Plate / Slate Markdown editor

Issue #6 authorizes a React 19 / Plate 53 editor island, bundled locally with
esbuild. Plate, Slate, React, the Plate plugins and remark-gfm retain their MIT
licenses. They are build-time npm dependencies; their browser code ships in
`public/editor/editor.js`. The build also writes `THIRD-PARTY-LICENSES.txt` with
the full licenses of bundled packages and keeps esbuild's legal comments.
No CDN or remote runtime assets are used.

Some upstream tarballs omit their license files. The build supplements these with
the Plate/React repository licenses and copies in `editor/licenses/` from:
https://github.com/ianstormtaylor/slate/blob/main/License.md,
https://github.com/udecode/jotai-x/blob/main/LICENSE (also used by zustand-x), and
https://github.com/JohannesKlauss/react-hotkeys-hook/blob/master/LICENSE.

## Fonts vendored in `public/fonts/`

Both families are variable fonts in WOFF2 format, subset to the Latin and
Latin Extended ranges, and served locally so that the page makes no request to
a font CDN.

### Inter

- Files: `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2`
- Use: interface text.
- Licence: SIL Open Font License, Version 1.1. Copyright 2016 The Inter
  Project Authors (https://github.com/rsms/inter). Full text:
  [public/fonts/LICENSE-Inter.txt](public/fonts/LICENSE-Inter.txt).

### Source Serif 4

- Files: `source-serif-4-latin-wght-normal.woff2`,
  `source-serif-4-latin-ext-wght-normal.woff2`,
  `source-serif-4-latin-wght-italic.woff2`,
  `source-serif-4-latin-ext-wght-italic.woff2`
- Use: manuscript text.
- Licence: SIL Open Font License, Version 1.1. Source Serif is developed by
  Adobe (https://github.com/adobe-fonts/source-serif); "Source" is a Reserved
  Font Name of Adobe. Full licence text as shipped with the font files:
  [public/fonts/LICENSE-SourceSerif4.txt](public/fonts/LICENSE-SourceSerif4.txt).

The OFL allows bundling and redistribution with software, provided the fonts
are not sold by themselves and the licence text travels with them. Margin
does not modify the font files.

## Development and test tooling

The test runner uses Node.js built-ins (`node:test`, `node:assert`). Browser and
Electron checks use Playwright (Apache-2.0), a development dependency. esbuild
(MIT) builds only the editor island; neither tool is shipped as a runtime service.
