import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { parseMarkdown } from "../markdown.mjs";

const flatten = (nodes) => (nodes || []).flatMap((node) => [node, ...flatten(node.children)]);
const rendered = (source) => parseMarkdown(source).flatMap((block) => flatten(block.tree));

it("renders GFM tables, nested lists, tasks, references and HTML as structured elements", () => {
  const source = "# Review\n\n| Item | Result |\n| :--- | ---: |\n| **Evidence** | `a\\|b` |\n\n- [x] Read\n  - Nested\n- [ ] Revise\n\n[Guide][ref]\n\n[ref]: https://example.org \"Guide title\"\n\n<details><summary>More</summary><p>HTML <sub>2</sub></p></details>\n";
  const nodes = rendered(source);
  for (const tag of ["table", "thead", "tbody", "th", "td", "strong", "code", "ul", "li", "input", "a", "details", "summary", "sub"]) assert.ok(nodes.some((node) => node.tag === tag), tag);
  assert.ok(nodes.some((node) => node.tag === "a" && node.attrs.href === "https://example.org"));
  assert.ok(nodes.some((node) => node.tag === "th" && node.attrs.align === "right"));
});

it("keeps source tiling and exact review offsets for repeated text, escapes and entities", () => {
  const source = "\uFEFF# 标题\r\n\r\n- **bold** and *nested **strong*** 😀\r\n\r\n| same | same |\r\n| --- | --- |\r\n| same | &amp; |\r\n\r\n[^same]: same &copy;\r\n\r\nA note[^same].\r\n\r\n<p>HTML &amp; &#x1F600; <em>same</em></p>\r\n";
  const blocks = parseMarkdown(source);
  assert.equal(blocks.map((block) => block.raw).join(""), source);
  for (const block of blocks) {
    assert.equal(source.slice(block.start, block.end), block.raw);
    assert.equal(block.display.length, block.displayStarts.length);
    assert.equal(block.display.length, block.displayEnds.length);
    for (let i = 0; i < block.display.length; i += 1) {
      if (block.displayStarts[i] === null) { assert.equal(block.displayEnds[i], null); continue; }
      assert.ok(block.displayStarts[i] >= 0 && block.displayEnds[i] <= block.raw.length);
      assert.ok(block.displayStarts[i] < block.displayEnds[i]);
    }
  }
  const cells = blocks.flatMap((block) => flatten(block.tree).filter((node) => node.tag === "td").map((cell) => ({ block, cell })));
  assert.equal(cells.length, 2);
  const leaf = flatten(cells[0].cell.children).find((node) => node.text === "same");
  const { block } = cells[0];
  assert.equal(block.start + block.displayStarts[leaf.from], source.indexOf("| same | &amp;") + 2);
  const amp = flatten(cells[1].cell.children).find((node) => node.text === "&");
  assert.equal(block.raw.slice(block.displayStarts[amp.from], block.displayEnds[amp.to - 1]), "&amp;");
});

it("never emits executable HTML or resource-loading attributes", () => {
  const source = '<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe><svg onload="bad()"></svg>\n\n<div id="document" onclick="bad()" style="background:url(https://evil.example)"><a href="javascript:alert(1)">unsafe</a><img src="https://evil.example/x" srcset="https://evil.example/y 2x" onerror="bad()"><input type="text" autofocus></div>\n';
  const nodes = rendered(source);
  assert.ok(nodes.length);
  for (const node of nodes) {
    assert.ok(!["script", "iframe", "svg", "style", "object", "form"].includes(node.tag));
    for (const key of Object.keys(node.attrs || {})) assert.ok(!/^on|^(style|srcset|autofocus)$/.test(key));
    assert.ok(!String(node.attrs?.href || "").startsWith("javascript:"));
  }
});

it("renders a complete document with math, footnotes, front matter and callouts", () => {
  const source = readFileSync(new URL("./fixtures/markdown/guide.md", import.meta.url), "utf8");
  const blocks = parseMarkdown(source);
  assert.equal(blocks.map((block) => block.raw).join(""), source);
  const nodes = blocks.flatMap((block) => flatten(block.tree));
  assert.equal(nodes.filter((node) => node.tag === "math").length, 3);
  assert.ok(nodes.some((node) => node.tag === "blockquote" && node.attrs.class?.includes("md-callout-note")));
  assert.ok(nodes.some((node) => node.attrs?.id === "md-fn-evidence"));
  assert.ok(nodes.some((node) => node.tag === "ol" && node.attrs.start === "3"));
  assert.ok(nodes.some((node) => node.tag === "img" && node.attrs.src === "figure.svg"));
  assert.ok(nodes.some((node) => node.tag === "img" && node.remote && !node.attrs.src));
  assert.equal(nodes.filter((node) => node.tag === "input" && "checked" in node.attrs).length, 1);
  for (const block of blocks) {
    for (const leaf of flatten(block.tree).filter((node) => node.text && node.mapped)) {
      assert.equal(block.display.slice(leaf.from, leaf.to), leaf.text);
      for (let i = leaf.from; i < leaf.to; i += 1) {
        assert.ok(Number.isInteger(block.displayStarts[i]) && block.displayStarts[i] >= 0);
        assert.ok(block.displayEnds[i] <= block.raw.length && block.displayEnds[i] > block.displayStarts[i]);
      }
    }
  }
});

it("maps nested formatting, links, repeated words and code to their exact source occurrence", () => {
  for (const source of [
    "***deep*** and **bold *inner* bold**",
    "[same](https://example.org/same \"same\") and same",
    "- same\n  - same\n\n> same\n> same\n",
    "` a  b ` and ``a ` b``",
    "| same | same |\n| --- | --- |\n| 😀 a\\|b | same |\n",
  ]) {
    for (const block of parseMarkdown(source)) for (const leaf of flatten(block.tree).filter((node) => node.text && node.mapped)) {
      for (let i = leaf.from; i < leaf.to; i += 1) {
        const raw = block.raw.slice(block.displayStarts[i], block.displayEnds[i]);
        assert.equal(raw.replace(/\\\|/g, "|"), block.display[i], `${JSON.stringify(source)} at ${i}`);
      }
    }
  }
});

it("maps autolink labels and nested image alternative text without guessing", () => {
  const source = '<https://example.org/same> and <reader@example.org>\n\n![**bold** alternative](figure.svg)\n';
  const blocks = parseMarkdown(source);
  const first = blocks[0];
  const leaf = flatten(first.tree).find((node) => node.text === "https://example.org/same");
  assert.equal(first.raw.slice(first.displayStarts[leaf.from], first.displayEnds[leaf.from]), "h");
  assert.equal(flatten(blocks.flatMap((block) => block.tree)).find((node) => node.tag === "img").attrs.alt, "bold alternative");
});

it("keeps Chinese table cells and math pipes intact with exact formula source ranges", () => {
  const source = readFileSync(new URL("./fixtures/markdown/math.md", import.meta.url), "utf8");
  const blocks = parseMarkdown(source);
  assert.equal(blocks.map((block) => block.raw).join(""), source);
  const tables = blocks.filter((block) => block.kind === "table");
  assert.equal(tables.length, 2);
  assert.equal(flatten(tables[0].tree).filter((node) => node.tag === "td").length, 12);
  const formulas = flatten(tables[1].tree).filter((node) => node.tag === "math");
  assert.deepEqual(formulas.map((node) => node.latex), ["P(A|B)", "|x|", "\\|v\\|"]);
  for (const block of tables) for (const node of flatten(block.tree).filter((node) => node.tag === "math")) {
    assert.equal(block.raw.slice(block.displayStarts[node.from], block.displayEnds[node.to - 1]), `$${node.latex}$`);
    assert.ok(node.svg, "table formulas are typeset locally");
  }
});

it("renders Typora-style AMS, chemistry, physics, macros and forward references with MathJax", () => {
  const source = readFileSync(new URL("./fixtures/markdown/math.md", import.meta.url), "utf8");
  const nodes = rendered(source).filter((node) => node.tag === "math");
  assert.equal(nodes.length, 15);
  assert.equal(nodes.filter((node) => node.error).length, 1);
  for (const node of nodes.filter((node) => !node.latex.includes("unsupportedCommand"))) assert.ok(node.svg, node.latex);
  assert.ok(nodes.find((node) => node.latex.includes("unsupportedCommand")).error);
  const ref = nodes.find((node) => node.latex === "\\eqref{demo}");
  assert.ok(flatten(ref.svg).some((node) => node.attrs?.["data-c"] === "41"), "forward reference resolves to tag A");
  assert.ok(rendered("$\\vect{z}$").find((node) => node.tag === "math").error, "macros must not leak between documents");
  assert.equal(rendered("`$x$`\n\n```tex\n$x$\n```\n").filter((node) => node.tag === "math").length, 0);
});

it("keeps TeX-generated attributes and errors from enabling external resources or HTML", () => {
  const nodes = rendered(String.raw`$\href{https://evil.example}{x}$

$\class{document}{x}$

$\color{url(https://evil.example/x)}{x}$

$\text{<img src=x onerror=bad()>}$
`).filter((node) => node.tag === "math");
  assert.equal(nodes.length, 4);
  for (const node of nodes) for (const svg of flatten(node.svg)) {
    assert.ok(!["script", "image", "foreignObject", "iframe"].includes(svg.tag));
    for (const [name, value] of Object.entries(svg.attrs || {})) {
      assert.ok(!name.startsWith("on"));
      assert.ok(!/url\s*\(/i.test(value));
      if (name === "href") assert.ok(value.startsWith("#mjx-"));
    }
  }
});

it("preserves CRLF source tiling and mappings for formula-heavy documents and adjacent tables", () => {
  const fixture = readFileSync(new URL("./fixtures/markdown/math.md", import.meta.url), "utf8");
  for (const source of ["\uFEFF" + fixture.replace(/\n/g, "\r\n"), "$\\begin{matrix}1&2\\\\3&4\\end{matrix}$", "$$\nx\n\n| A | B |\n| -- | -- |\n| x | y |\n"]) {
    const blocks = parseMarkdown(source);
    assert.equal(blocks.map((block) => block.raw).join(""), source);
    for (const block of blocks) {
      assert.equal(source.slice(block.start, block.end), block.raw);
      assert.equal(block.displayStarts.length, block.display.length);
      assert.equal(block.displayEnds.length, block.display.length);
      for (let i = 0; i < block.display.length; i += 1) {
        if (block.displayStarts[i] === null) continue;
        assert.ok(block.displayStarts[i] >= 0 && block.displayEnds[i] <= block.raw.length);
        assert.ok(block.displayStarts[i] < block.displayEnds[i]);
      }
    }
  }
});
