import { createHash } from "node:crypto";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { parseFragment } from "parse5";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { SafeHandler } from "mathjax-full/js/ui/safe/SafeHandler.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

const md = new MarkdownIt({ html: true, linkify: false, typographer: false, maxNesting: 40 }).use(footnote);
// Keep text tokens separate: joining decoded text would discard its provenance.
md.core.ruler.disable(["text_join", "footnote_tail"]);
md.inline.ruler.disable(["linkify", "footnote_inline"]);
md.inline.ruler2.disable("fragments_join");
const escape = md.utils.escapeHtml;
const pairs = (start, end) => Array.from({ length: end - start }, (_, i) => [start + i, start + i + 1]);
const mathAdaptor = liteAdaptor();
SafeHandler(RegisterHTMLHandler(mathAdaptor));

// Only geometry and local typography produced by MathJax cross into the client.
// This is separate from manuscript HTML: SVG supplied by a document stays blocked.
const mathTags = new Set(["mjx-container", "svg", "g", "path", "rect", "line", "text", "title", "defs", "use", "a"]);
const mathAttributes = new Set("jax display width height role focusable viewBox preserveAspectRatio d x y x1 x2 y1 y2 rx ry transform stroke-width stroke-dasharray stroke-linecap stroke-linejoin font-size font-family font-style font-weight text-anchor data-mml-node data-c data-mjx-texclass data-line data-frame data-background data-table".split(" "));
function mathTree(html) {
  let error = null;
  function visit(node) {
    if (node.nodeName === "#text") return { text: node.value };
    if (!mathTags.has(node.tagName)) return null;
    const attrs = {};
    for (const { name, value } of node.attrs || []) {
      if (name === "data-mjx-error") error = value;
      if (mathAttributes.has(name)) attrs[name] = value;
      else if (["fill", "stroke", "color"].includes(name) && /^(?:[a-z]+|#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(value)) attrs[name] = value;
      else if (name === "class" && /^(?:MathJax|mjx-[\w-]+)(?: (?:MathJax|mjx-[\w-]+))*$/.test(value)) attrs[name] = value;
      else if (name === "id" && value.startsWith("mjx-")) attrs[name] = value;
      else if (name === "href" && value.startsWith("#mjx-")) attrs.href = value;
      else if (name === "style") {
        const declarations = value.split(";").map((entry) => entry.trim()).filter((entry) => /^(vertical-align|min-width|width|height|margin-left|margin-right):\s*-?[\d.]+(?:ex|em|px|%)?$/.test(entry));
        if (declarations.length) attrs.style = declarations.join("; ");
      }
    }
    if (attrs["data-mml-node"] === "merror") error ||= "公式语法或命令暂不支持";
    return { tag: node.tagName, attrs, children: (node.childNodes || []).map(visit).filter(Boolean) };
  }
  const tree = parseFragment(html).childNodes.map(visit).filter(Boolean);
  return { tree, error };
}

function typesetMath(blocks) {
  const nodes = [];
  function collect(tree) {
    for (const node of tree) {
      if (node.tag === "math") nodes.push(node);
      else if (node.children) collect(node.children);
    }
  }
  for (const block of blocks) collect(block.tree);
  if (!nodes.length) return;
  // A fresh TeX context shares macros/labels within this document but never leaks
  // them to another file or revision. Document render handles forward references.
  const tex = new TeX({ packages: [...AllPackages.filter((name) => !["action", "html", "noerrors", "noundefined"].includes(name)), "physics"], tags: "ams", maxMacros: 1000, maxBuffer: 20000 });
  const document = mathjax.document("", {
    InputJax: tex,
    OutputJax: new SVG({ fontCache: "none" }),
    safeOptions: { allow: { URLs: "none", classes: "none", cssIDs: "none", styles: "none" } },
  });
  const items = [];
  for (const node of nodes) {
    const text = mathAdaptor.text(node.latex);
    const container = mathAdaptor.node("div", {}, [text]);
    mathAdaptor.append(document.document.body, container);
    const item = new document.options.MathItem(node.latex, tex, node.display, { node: text, n: 0, delim: "" }, { node: text, n: node.latex.length, delim: "" });
    document.math.push(item);
    items.push(item);
  }
  document.processed.set("findMath");
  try {
    document.render();
    for (const [index, item] of items.entries()) {
      const { tree, error } = mathTree(mathAdaptor.outerHTML(item.typesetRoot));
      if (error) nodes[index].error = error;
      else nodes[index].svg = tree;
    }
  } catch {
    for (const node of nodes) node.error = "公式暂无法排版，请检查公式语法或使用源码修订。";
  }
}

// Parser coordinates refer to normalized text. This boundary map preserves BOM,
// CRLF and UTF-16 offsets without ever normalizing the author's source on disk.
function normalized(source) {
  let text = "";
  const map = [];
  for (let i = source[0] === "\uFEFF" ? 1 : 0; i < source.length; i += 1) {
    const start = i;
    if (source[i] === "\r" && source[i + 1] === "\n") i += 1;
    text += source[start] === "\r" ? "\n" : source[start] === "\0" ? "\uFFFD" : source[start];
    map.push([start, i + 1]);
  }
  const lines = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") lines.push(i + 1);
  return { text, map, lines };
}

// Capture de-indented line boundaries while list/quote/footnote rules still have
// them in scope. Looking for repeated visible words in the whole source is unsafe.
const BlockState = md.block.State;
md.block.State = class extends BlockState {
  push(type, tag, nesting) {
    const token = super.push(type, tag, nesting);
    let value = null;
    Object.defineProperty(token, "map", {
      enumerable: true,
      get: () => value,
      set: (next) => {
        value = next;
        if (next) token.meta = { ...token.meta, lines: Array.from({ length: next[1] - next[0] }, (_, i) => {
          const line = next[0] + i;
          return [this.bMarks[line] + (["fence", "code_block", "margin_frontmatter"].includes(type) ? 0 : this.tShift[line]), this.eMarks[line]];
        }) };
      },
    });
    return token;
  }
};

const InlineState = md.inline.State;
md.inline.State = class extends InlineState {
  constructor(...args) { super(...args); this.marginPending = []; }
  pushPending() {
    const map = this.marginPending.slice(0, this.pending.length);
    const token = super.pushPending();
    token.meta = { ...token.meta, sourceMap: map };
    this.marginPending = [];
    return token;
  }
};

// Same rule contract as markdown-it's tokenizer, with ranges recorded before
// rules consume delimiters, decode entities or recursively parse link labels.
md.inline.tokenize = function (state) {
  const rules = this.ruler.getRules("");
  const end = state.posMax;
  while (state.pos < end) {
    const start = state.pos;
    const first = state.tokens.length;
    let matched = false;
    if (state.level < state.md.options.maxNesting) {
      for (const rule of rules) if (rule(state, false)) { matched = true; break; }
    }
    if (!matched) {
      state.pending += state.src[state.pos];
      state.marginPending.push([state.pos, state.pos + 1]);
      state.pos += 1;
      continue;
    }
    if (state.pos <= start) throw new Error("Markdown rule did not advance.");
    let cursor = start;
    for (const token of state.tokens.slice(first)) {
      if (token.meta?.sourceMap || token.meta?.range) continue;
      token.meta = { ...token.meta, range: [start, state.pos] };
      if (token.type === "link_open" && token.markup === "autolink") cursor = start + 1;
      if (token.type === "text" && state.src.startsWith(token.content, cursor)) {
        token.meta.sourceMap = pairs(cursor, cursor + token.content.length);
        cursor += token.content.length;
      }
    }
    if (state.marginPending.length < state.pending.length) {
      const suffix = state.pending.slice(state.marginPending.length);
      const at = state.src.indexOf(suffix, start);
      const map = at >= start && at + suffix.length <= state.pos ? pairs(at, at + suffix.length) : Array(suffix.length).fill(null);
      for (const span of map) state.marginPending.push(span);
    }
  }
  if (state.pending) state.pushPending();
};

function escapedAt(source, index) {
  let slashes = 0;
  while (index > 0 && source[--index] === "\\") slashes += 1;
  return slashes % 2 === 1;
}

function mathRange(source, start, max = source.length) {
  if (escapedAt(source, start)) return null;
  const rest = source.slice(start, max);
  const marker = rest.startsWith("\\(") ? "\\(" : rest.startsWith("\\[") ? "\\[" : rest.startsWith("$$") ? "$$" : rest[0] === "$" ? "$" : null;
  if (!marker || (marker === "$" && /\s/.test(rest[1] || " "))) return null;
  const closer = marker === "\\(" ? "\\)" : marker === "\\[" ? "\\]" : marker;
  let end = start + marker.length;
  while ((end = source.indexOf(closer, end)) >= 0 && end + closer.length <= max) {
    if (!escapedAt(source, end) && (marker !== "$" || (!/\s/.test(source[end - 1]) && !/\d/.test(source[end + 1] || "")))) break;
    end += closer.length;
  }
  if (end < 0 || end + closer.length > max || (marker === "$" && source.slice(start, end).includes("\n"))) return null;
  return { from: start + marker.length, to: end, end: end + closer.length, display: marker === "$$" || marker === "\\[" };
}

md.inline.ruler.before("escape", "margin_math", (state, silent) => {
  const range = mathRange(state.src, state.pos, state.posMax);
  if (!range) return false;
  if (!silent) {
    const token = state.push("margin_math", "", 0);
    token.content = state.src.slice(range.from, range.to);
    token.meta = { display: range.display };
  }
  state.pos = range.end;
  return true;
});

md.block.ruler.before("fence", "margin_math_block", (state, start, end, silent) => {
  const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
  const marker = line.startsWith("$$") ? "$$" : line.startsWith("\\[") ? "\\[" : null;
  const environment = line.match(/^\\begin\{((?:equation|align|alignat|gather|multline|eqnarray|displaymath)\*?)\}/)?.[1];
  if (!marker && !environment) return false;
  const closer = marker === "$$" ? "$$" : marker === "\\[" ? "\\]" : `\\end{${environment}}`;
  let next = start;
  let close = -1;
  while (next < end) {
    const content = state.src.slice(state.bMarks[next] + state.tShift[next], state.eMarks[next]);
    let at = next === start ? (marker?.length || 0) : 0;
    while ((at = content.indexOf(closer, at)) >= 0) {
      if (!escapedAt(content, at) && !content.slice(at + closer.length).trim()) { close = at; break; }
      at += closer.length;
    }
    if (close >= 0) break;
    next += 1;
  }
  if (next === end) return false;
  if (!silent) {
    const token = state.push("margin_math_block", "", 0);
    const content = state.getLines(start, next + 1, state.blkIndent, false).trim();
    token.content = marker ? content.slice(marker.length, -closer.length).trim() : content;
    token.map = [start, next + 1];
    state.line = next + 1;
  }
  return true;
}, { alt: ["paragraph", "blockquote", "list"] });

function mathPipes(line) {
  const pipes = new Set();
  for (let i = 0; i < line.length;) {
    // Backtick code is opaque to math parsing, just as it is in inline rules.
    if (line[i] === "`" && !escapedAt(line, i)) {
      const ticks = line.slice(i).match(/^`+/)[0];
      const end = line.indexOf(ticks, i + ticks.length);
      if (end >= 0) { i = end + ticks.length; continue; }
    }
    const range = line[i] === "$" || line[i] === "\\" ? mathRange(line, i) : null;
    if (!range) { i += 1; continue; }
    for (let j = range.from; j < range.to; j += 1) if (line[j] === "|") pipes.add(j);
    i = range.end;
  }
  return pipes;
}

// GFM splits cells before inline parsing, including pipes in formulas and the
// backslashes in TeX's \|. Shield just those pipes while the upstream table rule
// runs, with one-code-unit placeholders so all source coordinates remain exact.
const tableRule = md.block.ruler.__rules__.find((rule) => rule.name === "table").fn;
md.block.ruler.at("table", (state, start, end, silent) => {
  const source = state.src;
  if (start + 1 >= end || !source.slice(state.bMarks[start], state.eMarks[start]).includes("|") ||
      !/^[\s|:-]+$/.test(source.slice(state.bMarks[start + 1], state.eMarks[start + 1]))) return tableRule(state, start, end, silent);
  let code = 0xE000;
  while (code <= 0xF8FF && source.includes(String.fromCharCode(code))) code += 1;
  if (code > 0xF8FF) return tableRule(state, start, end, silent);
  const marker = String.fromCharCode(code);
  const replacements = [];
  for (let line = start; line < end && !state.isEmpty(line); line += 1) {
    const offset = state.bMarks[line];
    for (const index of mathPipes(source.slice(offset, state.eMarks[line]))) replacements.push(offset + index);
  }
  if (!replacements.length) return tableRule(state, start, end, silent);
  const parts = [];
  let cursor = 0;
  for (const at of replacements) { parts.push(source.slice(cursor, at), marker); cursor = at + 1; }
  parts.push(source.slice(cursor));
  const first = state.tokens.length;
  state.src = parts.join("");
  try { return tableRule(state, start, end, silent); }
  finally {
    state.src = source;
    for (const token of state.tokens.slice(first)) token.content = token.content.replaceAll(marker, "|");
  }
}, { alt: ["paragraph", "reference"] });

md.block.ruler.before("hr", "margin_frontmatter", (state, start, end, silent) => {
  if (start !== 0 || state.src.slice(0, state.eMarks[0]).trim() !== "---") return false;
  let next = 1;
  while (next < end && !/^(---|\.\.\.)\s*$/.test(state.src.slice(state.bMarks[next], state.eMarks[next]))) next += 1;
  if (next === end) return false;
  if (!silent) {
    const token = state.push("margin_frontmatter", "", 0);
    token.content = state.getLines(1, next, 0, false);
    token.map = [0, next + 1];
    state.line = next + 1;
  }
  return true;
});

function contentMap(content, ranges, source) {
  const result = [];
  const append = (items) => { for (const item of items) result.push(item); };
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const range = ranges[index];
    if (!range) { append(Array(line.length).fill(null)); continue; }
    const [start, end] = range;
    const found = source.indexOf(line, start);
    if (line && found >= start && found + line.length <= end) append(pairs(found, found + line.length));
    else {
      // Table rules remove escapes before pipes and code blocks expand tabs.
      let cursor = start;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const from = cursor;
        if (source[cursor] === "\\" && source[cursor + 1] === char) cursor += 1;
        if (source[cursor] === char && cursor < end) { result.push([from, cursor + 1]); cursor += 1; }
        else if (char === " " && source[cursor] === "\t") result.push([cursor, cursor + 1]);
        else { result.push(null); }
      }
    }
    if (index < lines.length - 1) result.push([end, end + 1]);
  }
  return result;
}

function tableCells(range, source) {
  if (!range) return [];
  let [start, end] = range;
  while (/\s/.test(source[start] || "") && start < end) start += 1;
  while (/\s/.test(source[end - 1] || "") && end > start) end -= 1;
  if (source[start] === "|") start += 1;
  if (source[end - 1] === "|" && source[end - 2] !== "\\") end -= 1;
  const cells = [];
  const protectedPipes = mathPipes(source.slice(start, end));
  let from = start;
  for (let i = start; i <= end; i += 1) {
    if (source[i] === "\\") { i += 1; continue; }
    if ((source[i] === "|" && !protectedPipes.has(i - start)) || i === end) {
      let a = from;
      let b = i;
      while (a < b && /\s/.test(source[a])) a += 1;
      while (b > a && /\s/.test(source[b - 1])) b -= 1;
      cells.push([a, b]);
      from = i + 1;
    }
  }
  return cells;
}

class MappedHtml {
  html = "";
  map = [];
  special = new Map();
  add(value, map = []) { this.html += value; for (let i = 0; i < value.length; i += 1) this.map.push(map[i] || null); }
  text(value, map = []) {
    for (let i = 0; i < value.length; i += 1) {
      const escaped = escape(value[i]);
      this.add(escaped, Array(escaped.length).fill(map[i] || null));
    }
  }
  atom(data, range) {
    this.special.set(this.html.length, { ...data, range });
    this.add("<span></span>");
  }
}

function renderTokens(tokens, out, norm, env, inlineMap = null) {
  let cells = [];
  let cell = 0;
  let inLink = 0;
  const absolute = (map) => map.map((span) => span && norm.map[span[0]] && norm.map[span[1] - 1] ? [norm.map[span[0]][0], norm.map[span[1] - 1][1]] : null);
  const tokenMap = (token) => {
    if (!inlineMap) return [];
    if (token.meta?.sourceMap) return absolute(token.meta.sourceMap.map((span) => span && inlineMap[span[0]] && inlineMap[span[1] - 1] ? [inlineMap[span[0]][0], inlineMap[span[1] - 1][1]] : null));
    const [start, end] = token.meta?.range || [0, 0];
    const full = inlineMap[start] && inlineMap[end - 1] ? absolute([[inlineMap[start][0], inlineMap[end - 1][1]]])[0] : null;
    if (token.type === "code_inline") {
      let a = start + token.markup.length;
      let b = end - token.markup.length;
      const text = tokens.source?.slice(a, b).replace(/\n/g, " ");
      if (text?.startsWith(" ") && text.endsWith(" ") && /[^ ]/.test(text)) { a += 1; b -= 1; }
      return absolute(inlineMap.slice(a, b));
    }
    return Array((token.content || "\n").length).fill(full);
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const type = token.type;
    if (type === "tr_open") { cells = tableCells(token.meta?.lines?.[0], norm.text); cell = 0; }
    if (type === "inline") {
      const ranges = token.meta?.lines || (cells[cell] ? [cells[cell++]] : []);
      const map = contentMap(token.content, ranges, norm.text);
      const children = token.children || [];
      children.source = token.content;
      // Read-only task controls never mutate manuscript source.
      if (tokens[i - 1]?.type === "paragraph_open" && tokens[i - 2]?.type === "list_item_open") {
        const first = children[0];
        const task = first?.type === "text" && first.content.match(/^\[([ xX])\]\s+/);
        if (task) {
          out.add(`<input type="checkbox" disabled${task[1] !== " " ? " checked" : ""}>`);
          children[0] = { ...first, content: first.content.slice(task[0].length), meta: { ...first.meta, sourceMap: first.meta.sourceMap?.slice(task[0].length) } };
        }
      }
      renderTokens(children, out, norm, env, map);
    } else if (type === "text" || type === "text_special") {
      const map = tokenMap(token);
      const links = inLink ? [] : md.linkify.match(token.content) || [];
      let cursor = 0;
      for (const link of links) {
        out.text(token.content.slice(cursor, link.index), map.slice(cursor, link.index));
        out.add(`<a href="${escape(link.url)}">`);
        out.text(token.content.slice(link.index, link.lastIndex), map.slice(link.index, link.lastIndex));
        out.add("</a>");
        cursor = link.lastIndex;
      }
      out.text(token.content.slice(cursor), map.slice(cursor));
    } else if (type === "html_inline") {
      const [a, b] = token.meta.range;
      out.add(token.content, absolute(inlineMap.slice(a, b)));
      if (/^<a\s/i.test(token.content)) inLink += 1;
      if (/^<\/a\s*>/i.test(token.content)) inLink = Math.max(0, inLink - 1);
    } else if (type === "html_block") {
      out.add(token.content, absolute(contentMap(token.content, token.meta.lines, norm.text)));
    } else if (type === "fence" && token.info.trim().toLowerCase() === "math") {
      const range = absolute([[norm.lines[token.map[0]], norm.lines[token.map[1]] ?? norm.text.length]])[0];
      out.atom({ tag: "math", latex: token.content.trim(), display: true }, range);
    } else if (["fence", "code_block", "margin_frontmatter"].includes(type)) {
      let ranges = token.meta.lines;
      if (type === "fence" || type === "margin_frontmatter") ranges = ranges.slice(1);
      if (type === "margin_frontmatter") out.add('<details><summary>文档属性</summary>');
      const language = type === "fence" ? token.info.trim().split(/\s+/)[0] : type === "margin_frontmatter" ? "yaml" : "";
      out.add(`<pre><code${/^[\w+-]{1,30}$/.test(language) ? ` class="language-${language}"` : ""}>`);
      out.text(token.content, absolute(contentMap(token.content, ranges, norm.text)));
      out.add("</code></pre>");
      if (type === "margin_frontmatter") out.add("</details>");
    } else if (type === "code_inline") {
      out.add("<code>"); out.text(token.content, tokenMap(token)); out.add("</code>");
    } else if (type === "softbreak") out.text("\n", tokenMap(token));
    else if (type === "hardbreak") out.add("<br>");
    else if (type === "image") {
      const [a, b] = token.meta.range;
      const range = inlineMap[a] && inlineMap[b - 1] ? absolute([[inlineMap[a][0], inlineMap[b - 1][1]]])[0] : null;
      const attrs = { src: token.attrGet("src"), alt: md.renderer.renderInlineAsText(token.children || [], md.options, env), title: token.attrGet("title") || "" };
      out.special.set(out.html.length, { imageRange: range });
      out.add(`<img${Object.entries(attrs).map(([key, value]) => ` ${key}="${escape(value)}"`).join("")}>`);
    } else if (type === "margin_math" || type === "margin_math_block") {
      let range;
      if (inlineMap) {
        const [a, b] = token.meta.range;
        range = inlineMap[a] && inlineMap[b - 1] ? absolute([[inlineMap[a][0], inlineMap[b - 1][1]]])[0] : null;
      } else range = absolute([[norm.lines[token.map[0]], norm.lines[token.map[1]] ?? norm.text.length]])[0];
      out.atom({ tag: "math", latex: token.content, display: type === "margin_math_block" || token.meta.display }, range);
    } else if (type === "footnote_reference_open") {
      out.add(`<aside class="md-footnote" id="fn-${escape(token.meta.label)}"><span class="md-footnote-label">[${escape(token.meta.label)}] </span>`);
    } else if (type === "footnote_reference_close") out.add("</aside>");
    else if (type === "footnote_ref") {
      out.add(`<sup><a href="#fn-${escape(token.meta.label)}">`);
      out.text(`[${token.meta.id + 1}]`, Array(String(token.meta.id + 1).length + 2).fill(tokenMap(token)[0]));
      out.add("</a></sup>");
    } else if (token.nesting === -1) {
      out.add(`</${token.tag}>`);
      if (type === "link_close") inLink -= 1;
    } else if (token.tag) {
      const attrs = [...(token.attrs || [])];
      if (type === "heading_open") {
        const text = (tokens[i + 1]?.children || []).filter((child) => ["text", "text_special", "code_inline", "image", "margin_math"].includes(child.type)).map((child) => child.content).join("") || "section";
        const slug = text.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, "").trim().replace(/\s/g, "-");
        const count = env.marginSlugs.get(slug) || 0;
        env.marginSlugs.set(slug, count + 1);
        attrs.push(["id", `${slug}${count ? `-${count}` : ""}`]);
      }
      out.add(`<${token.tag}${attrs.map(([key, value]) => ` ${key}="${escape(value)}"`).join("")}>`);
      if (type === "link_open") inLink += 1;
    }
  }
}

const allowedTags = new Set("a abbr aside b blockquote br caption code col colgroup dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img input ins kbd li mark ol p pre s samp small span strong sub summary sup table tbody td th thead tfoot tr u ul var".split(" "));
const discardedTags = new Set("script style iframe object embed svg math template form button textarea select option link meta base video audio source canvas".split(" "));
function safeUrl(value, image = false) {
  const url = String(value || "").trim();
  if (!url || /[\u0000-\u001f\u007f\\]/.test(url) || url.startsWith("//")) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return !image && /^(https?:|mailto:)/i.test(url) ? url : null;
  return url;
}

// Decode each entity as one source span, including HTML's semicolon-less forms.
function decodedText(raw, map) {
  let text = "";
  const result = [];
  for (let i = 0; i < raw.length;) {
    const entity = raw[i] === "&" && raw.slice(i).match(/^&(?:#[xX][\da-fA-F]+;?|#\d+;?|[A-Za-z][A-Za-z\d]{0,31};?)/)?.[0];
    if (entity) {
      const decoded = parseFragment(entity).childNodes.map((node) => node.value || "").join("");
      if (decoded !== entity) {
        let suffix = 0;
        while (suffix < decoded.length && suffix < entity.length && decoded.at(-suffix - 1) === entity.at(-suffix - 1)) suffix += 1;
        const consumed = entity.length - suffix;
        const value = decoded.slice(0, decoded.length - suffix);
        const span = map[i] && map[i + consumed - 1] ? [map[i][0], map[i + consumed - 1][1]] : null;
        text += value;
        result.push(...Array(value.length).fill(span));
        i += consumed;
        continue;
      }
    }
    text += raw[i]; result.push(map[i] || null); i += 1;
  }
  return { text, map: result };
}

function treeFromHtml(out, block) {
  const fragment = parseFragment(out.html, { sourceCodeLocationInfo: true });
  const display = [];
  const starts = [];
  const ends = [];
  let displayLength = 0;
  const leaf = (text, map) => {
    const from = displayLength;
    display.push(text); displayLength += text.length;
    for (const span of map) { starts.push(span ? span[0] - block.start : null); ends.push(span ? span[1] - block.start : null); }
    return { text, from, to: displayLength, mapped: map.length === text.length && map.every(Boolean) };
  };
  function visit(node, depth = 0) {
    if (depth > 80) return [];
    const loc = node.sourceCodeLocation;
    const special = loc && out.special.get(loc.startOffset);
    if (special?.tag === "math") {
      return [{ ...special, ...leaf(special.latex, Array(special.latex.length).fill(special.range)) }];
    }
    if (node.nodeName === "#text") {
      if (!loc) return [];
      const raw = out.html.slice(loc.startOffset, loc.endOffset);
      const decoded = decodedText(raw, out.map.slice(loc.startOffset, loc.endOffset));
      return [leaf(node.value, decoded.text === node.value ? decoded.map : Array(node.value.length).fill(null))];
    }
    const tag = node.tagName;
    if (!tag || discardedTags.has(tag)) return [];
    const children = () => (node.childNodes || []).flatMap((child) => visit(child, depth + 1));
    if (!allowedTags.has(tag)) return children();
    const rawAttrs = Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
    const attrs = {};
    for (const name of ["title", "alt"]) if (rawAttrs[name]) attrs[name] = rawAttrs[name];
    if (rawAttrs.id) attrs.id = `md-${rawAttrs.id}`;
    const align = rawAttrs.align || rawAttrs.style?.match(/^\s*text-align:\s*(left|center|right)\s*;?\s*$/i)?.[1];
    if (/^(left|center|right)$/i.test(align || "")) attrs.align = align.toLowerCase();
    for (const name of ["colspan", "rowspan", "width", "height", "start"]) {
      if (/^\d{1,5}$/.test(rawAttrs[name] || "")) attrs[name] = String(Math.max(1, Math.min(10000, Number(rawAttrs[name]))));
    }
    if (tag === "details" && "open" in rawAttrs) attrs.open = "";
    if (tag === "code" && /^language-[\w+-]{1,30}$/.test(rawAttrs.class || "")) attrs.class = rawAttrs.class;
    if (["md-footnote", "md-footnote-label"].includes(rawAttrs.class) || /^md-callout md-callout-(note|tip|important|warning|caution)$/.test(rawAttrs.class || "")) attrs.class = rawAttrs.class;
    if (tag === "input") {
      if (rawAttrs.type !== "checkbox") return [];
      attrs.type = "checkbox"; attrs.disabled = "";
      if ("checked" in rawAttrs) attrs.checked = "";
    }
    if (tag === "a") {
      const href = safeUrl(rawAttrs.href);
      if (href) attrs.href = href.startsWith("#") ? `#md-${href.slice(1)}` : href;
    }
    if (tag === "img") {
      const src = safeUrl(rawAttrs.src, true);
      const maps = loc ? out.map.slice(loc.startOffset, loc.endOffset).filter(Boolean) : [];
      const range = special?.imageRange || (maps.length ? [maps[0][0], maps.at(-1)[1]] : null);
      const alt = attrs.alt || "图片";
      return [{ tag: "img", attrs: { ...attrs, ...(src ? { src } : {}) }, ...leaf(alt, Array(alt.length).fill(range)), remote: !src && Boolean(rawAttrs.src), children: [] }];
    }
    return [{ tag, attrs, children: children() }];
  }
  const tree = fragment.childNodes.flatMap((node) => visit(node));
  return { tree, display: display.join(""), displayStarts: starts, displayEnds: ends };
}

export function parseMarkdown(source) {
  const norm = normalized(source);
  const env = { marginSlugs: new Map() };
  const tokens = md.parse(norm.text, env);
  const groups = [];
  for (let i = 0; i < tokens.length;) {
    const first = i++;
    let depth = tokens[first].nesting;
    while (depth > 0 && i < tokens.length) depth += tokens[i++].nesting;
    const group = tokens.slice(first, i);
    const ranges = group.filter((token) => token.map).map((token) => token.map);
    if (!ranges.length) continue;
    const startLine = ranges.reduce((value, range) => Math.min(value, range[0]), Infinity);
    const endLine = ranges.reduce((value, range) => Math.max(value, range[1]), 0);
    const start = norm.map[norm.lines[startLine]]?.[0] ?? source.length;
    const end = norm.map[norm.lines[endLine]]?.[0] ?? source.length;
    const type = group[0].type;
    const kind = type === "heading_open" ? "heading" : type === "table_open" ? "table" : ["fence", "code_block"].includes(type) ? "code" : type === "blockquote_open" ? "quote" : /list_open$/.test(type) ? "list" : type === "html_block" ? "html" : type === "margin_math_block" ? "math" : type === "margin_frontmatter" ? "frontmatter" : "paragraph";
    if (kind === "quote") {
      const first = group.find((token) => token.type === "inline")?.children?.[0];
      const callout = first?.type === "text" && first.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/);
      if (callout) {
        group[0].attrSet("class", `md-callout md-callout-${callout[1].toLowerCase()}`);
        first.content = callout[1];
        first.meta.sourceMap = first.meta.sourceMap?.slice(2, -1);
      }
    }
    const out = new MappedHtml();
    renderTokens(group, out, norm, env);
    groups.push({ start, end, kind, level: kind === "heading" ? Number(group[0].tag.slice(1)) : null, out });
  }
  const blocks = [];
  let cursor = 0;
  function add(start, end, group = null) {
    if (end <= start) return;
    const raw = source.slice(start, end);
    const block = { index: blocks.length, id: `${blocks.length}-${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`, start, end, raw, kind: group?.kind || "structure", level: group?.level || null };
    const view = group ? treeFromHtml(group.out, block) : { tree: [], display: "", displayStarts: [], displayEnds: [] };
    blocks.push({ ...block, ...view, hidden: !view.tree.length, styles: [], annotations: [] });
  }
  for (const group of groups) {
    if (group.start > cursor) add(cursor, group.start);
    add(group.start, group.end, group);
    cursor = group.end;
  }
  if (cursor < source.length) add(cursor, source.length);
  typesetMath(blocks);
  return blocks;
}

export function markdownDisplay(raw) {
  const blocks = parseMarkdown(raw);
  return { display: blocks.map((block) => block.display).join(""), displayStarts: blocks.flatMap((block) => block.displayStarts.map((offset) => offset === null ? null : block.start + offset)), displayEnds: blocks.flatMap((block) => block.displayEnds.map((offset) => offset === null ? null : block.start + offset)), hidden: blocks.every((block) => block.hidden), styles: [], annotations: [] };
}
