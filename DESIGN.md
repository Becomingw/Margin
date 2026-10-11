# Margin · 页边

An independent local reading and review workspace. The document is the focal
point; navigation and review history form its quiet margins.

## Reference and interpretation

Inspired by the Notion and Linear analyses in
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md): warm neutral
surfaces, compact tool controls, fine borders and restrained lavender accents.
These are product-interface adaptations, not copies of their marketing pages,
logos or proprietary fonts. Use locally bundled Inter and Source Serif 4.

## Tokens

| Role | Light | Dark |
|---|---|---|
| Canvas | #f6f5f2 | #17181c |
| Sidebar | #efeeeb | #1c1d22 |
| Paper / surface | #fffefa | #222329 |
| Ink | #29282e | #ececf0 |
| Secondary ink | #77747e | #a5a3af |
| Hairline | #e5e3e0 | #34343d |
| Accent | #6458b5 | #b4a9f1 |
| Accent wash | #eeebf7 | #302c43 |
| Primary button | #6458b5 / white | #b4a9f1 / #201c30 |

Use a 4px spacing grid, 6–8px control corners and 12px panel corners. Shadow is
reserved for the paper, popovers and dialogs. No gradients or decorative glow.
Interface icons use consistent 1.6px strokes. The brand mark combines a folded
ivory page, purple margin rule and lavender comment bubble on a purple tile.
Native icons include multiple resolutions for small taskbar and large Dock use.

## Layout

- Desktop: 224px navigation, flexible reading column, 328px review inspector.
- 56px top bar, separate document identity and editing toolbar.
- Paper: maximum 800px, 40–64px inner space, 17px serif body / 1.85 leading.
- Interface: 12–14px Inter; headings 500–650 weight; no serif UI controls.
- Group import tools in the navigation; keep one primary export action up top.
- Inspector: title and count, underline tabs, compact filter, quiet comment cards.
- IDs remain available under disclosure; readable comments lead each card.
- Below 1100px narrow the rails; below 850px stack navigation, paper and reviews.
  At touch sizes controls have at least 44px targets and block actions stay visible.

## States and behavior

Hover uses a neutral surface or accent wash; keyboard focus uses a visible 2px
ring. Loading, disconnected, read-only and error states use text, not color alone.
Light and dark modes use the same hierarchy. Honor reduced motion. Empty panels
explain the next action. Every control must work; no decorative fake user avatars,
statistics, search boxes or cloud/sync claims.

## Verification

Use fictional documents only. Check both formats, selection comments, revision
views, imports, dark mode, narrow screens and native home. Regenerate screenshots
after visual changes and inspect them. Generate installation packages for releases.
