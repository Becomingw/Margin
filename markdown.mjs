import { createHash } from "node:crypto";

// A source-preserving reader, not a Markdown-to-HTML converter. Every displayed
// character points back to the original string; unrecognised syntax stays visible.
export function markdownDisplay(raw, kind = "paragraph") {
  const hidden = new Set();
  const sourceStyles = [];
  const sourceAnnotations = [];
  const hide = (start, end) => { for (let i = start; i < end; i += 1) hidden.add(i); };
  if (kind === "heading") {
    const opening = raw.match(/^\uFEFF? {0,3}#{1,6}[ \t]+/);
    if (opening) hide(0, opening[0].length);
    const closing = raw.match(/[ \t]+#+[ \t]*(?:\r?\n)?$/);
    if (closing) hide(closing.index, closing.index + closing[0].trimEnd().length);
    const underline = raw.match(/\r?\n {0,3}(?:=+|-+)[ \t]*(?:\r?\n)?$/);
    if (underline) hide(underline.index, raw.length);
  }
  if (kind === "code") {
    const lines = raw.match(/^[^\n]*(?:\n|$)/)?.[0] || "";
    hide(0, lines.length);
    const close = raw.match(/(?:^|\n) {0,3}(?:`{3,}|~{3,})[ \t]*(?:\r?\n)?$/);
    if (close) hide(close.index, raw.length);
  } else {
    // Inline code is opaque: stars and brackets inside it are literal.
    const opaque = new Set();
    for (const match of raw.matchAll(/(`+)([^\n]*?)\1/g)) {
      hide(match.index, match.index + match[1].length);
      hide(match.index + match[0].length - match[1].length, match.index + match[0].length);
      for (let i = match.index; i < match.index + match[0].length; i += 1) opaque.add(i);
      sourceStyles.push({ type: "code", start: match.index + match[1].length, end: match.index + match[0].length - match[1].length });
    }
    for (const match of raw.matchAll(/(\${1,2})([^$]+?)\1/g)) {
      if (opaque.has(match.index) || raw[match.index - 1] === "\\") continue;
      hide(match.index, match.index + match[1].length);
      hide(match.index + match[0].length - match[1].length, match.index + match[0].length);
      sourceAnnotations.push({ type: "math", latex: match[2], display: match[1].length === 2, start: match.index + match[1].length, end: match.index + match[0].length - match[1].length });
      for (let i = match.index; i < match.index + match[0].length; i += 1) opaque.add(i);
    }
    for (const match of raw.matchAll(/(\*\*|__|~~|\*|_)(?=\S)([^\n]*?\S)\1/g)) {
      if (opaque.has(match.index) || raw[match.index - 1] === "\\") continue;
      if (match[1].includes("_") && /[\p{L}\p{N}]/u.test(raw[match.index - 1] || "")) continue;
      hide(match.index, match.index + match[1].length);
      hide(match.index + match[0].length - match[1].length, match.index + match[0].length);
      sourceStyles.push({ type: match[1] === "~~" ? "strike" : match[1].length === 2 ? "strong" : "em", start: match.index + match[1].length, end: match.index + match[0].length - match[1].length });
    }
    for (const match of raw.matchAll(/(!?)\[([^\]\n]*)\]\(([^)\n]*)\)/g)) {
      if (opaque.has(match.index) || raw[match.index - 1] === "\\") continue;
      hide(match.index, match.index + match[1].length + 1);
      hide(match.index + match[1].length + 1 + match[2].length, match.index + match[0].length);
    }
  }
  let display = "";
  const displayStarts = [];
  const displayEnds = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (hidden.has(i) || raw[i] === "\uFEFF") continue;
    display += raw[i];
    displayStarts.push(i);
    displayEnds.push(i + 1);
  }
  const mapped = (span) => ({ ...span, start: displayStarts.filter((offset) => offset < span.start).length, end: displayStarts.filter((offset) => offset < span.end).length });
  return { display, displayStarts, displayEnds, hidden: !display.trim(), styles: sourceStyles.map(mapped), annotations: sourceAnnotations.map(mapped) };
}

export function parseMarkdown(source) {
  const lines = [...source.matchAll(/[^\n]*\n|[^\n]+$/g)];
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const first = i;
    const line = lines[i][0].replace(/^\uFEFF/, "");
    let kind = "paragraph";
    let level = null;
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+/);
    if (!line.trim()) {
      kind = "structure";
      i += 1;
    } else if (fence) {
      kind = "code";
      i += 1;
      const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*(?:\\r?\\n)?$`);
      while (i < lines.length) { if (closing.test(lines[i++][0])) break; }
    } else if (heading) {
      kind = "heading";
      level = heading[1].length;
      i += 1;
    } else if (i + 1 < lines.length && /^ {0,3}(?:=+|-+)[ \t]*\r?\n?$/.test(lines[i + 1][0])) {
      kind = "heading";
      level = lines[i + 1][0].trim()[0] === "=" ? 1 : 2;
      i += 2;
    } else {
      if (/^ {0,3}>/.test(line)) kind = "quote";
      if (/^\s*(?:[-+*]|\d+[.)])[ \t]+/.test(line)) kind = "list";
      if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1][0])) kind = "table";
      if (/^\s*\$\$/.test(line)) kind = "math";
      i += 1;
      while (i < lines.length && lines[i][0].trim() && !/^ {0,3}(?:#{1,6}\s|`{3,}|~{3,})/.test(lines[i][0])) i += 1;
    }
    const start = lines[first].index;
    const end = i < lines.length ? lines[i].index : source.length;
    const raw = source.slice(start, end);
    blocks.push({ index: blocks.length, id: `${blocks.length}-${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`, start, end, raw, kind, level, ...markdownDisplay(raw, kind) });
  }
  return blocks;
}
