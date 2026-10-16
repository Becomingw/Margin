import assert from "node:assert/strict";
import test from "node:test";
import { createSlateEditor, createSlatePlugin } from "platejs";
import { BaseBoldPlugin, BaseHeadingPlugin, BaseItalicPlugin } from "@platejs/basic-nodes";
import { BaseTablePlugin, BaseTableRowPlugin, BaseTableCellPlugin, BaseTableCellHeaderPlugin } from "@platejs/table";
import { MarkdownPlugin } from "@platejs/markdown";
import remarkGfm from "remark-gfm";
import { parseMarkdown } from "../markdown.mjs";
import { createSourceModel, captureNormalizedValue, serializeDraft, leaves, sourcePoint } from "../editor/source-model.js";

const editor = createSlateEditor({ plugins: [BaseBoldPlugin, BaseHeadingPlugin, BaseItalicPlugin, BaseTablePlugin, BaseTableRowPlugin, BaseTableCellPlugin, BaseTableCellHeaderPlugin, createSlatePlugin({ key: "a", node: { isElement: true, isInline: true } }), MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } })] });
const md = editor.getApi(MarkdownPlugin).markdown;
const modelFor = (source) => createSourceModel({ source, blocks: parseMarkdown(source) }, (text) => md.deserialize(text));
const save = (model, nodes) => serializeDraft(model, nodes, (value) => md.serialize({ value, preserveEmptyParagraphs: false }));

test("Plate source adapter preserves exact untouched manuscript and opaque structures", () => {
  for (const source of ["\uFEFF# Title\r\n\r\nA __bold__ &amp; cautious 😀 claim.\r\n", "---\ntitle: Fiction\n---\n\nMath $\\ce{H2O}$ and [link](https://example.invalid).\n\n<div>Keep HTML</div>\n\n[^x]: Footnote\n", "", "\n\n", "| A | B |\n| --- | --- |\n| keep | exact |\n"]) {
    const model = modelFor(source);
    assert.equal(save(model, structuredClone(model.value)), source);
  }
});

test("Plate text edits preserve untouched syntax, BOM, CRLF, entities and emoji boundaries", () => {
  const source = "\uFEFF# Title\r\n\r\nA __bold__ &amp; cautious 😀 claim.\r\n\r\nUntouched  spacing.\n";
  const model = modelFor(source);
  const value = structuredClone(model.value);
  const leaf = leaves(value).find(({ node }) => node.text.includes("cautious"));
  leaf.node.text = leaf.node.text.replace("cautious 😀", "careful 😁");
  assert.equal(save(model, value), source.replace("cautious 😀", "careful 😁"));
  leaf.node.text = leaf.node.text.replace("careful 😁", "*literal*");
  assert.equal(save(model, value), source.replace("cautious 😀", "\\*literal\\*"));
});

test("Plate formatting rewrites only the changed block and maps clean selections to source", () => {
  const source = "# Title\r\n\r\nA cautious claim.\r\n\r\nKeep __these__ delimiters.\n";
  const model = modelFor(source);
  assert.equal(sourcePoint(model, model.value, { path: [1, 0], offset: 2 }), source.indexOf("cautious"));
  const value = structuredClone(model.value);
  value[1].children = [{ text: "A " }, { text: "cautious", bold: true }, { text: " claim." }];
  assert.equal(save(model, value), source.replace("A cautious claim.", "A **cautious** claim."));
  assert.equal(sourcePoint(model, value, { path: [1, 1], offset: 0 }), null);
});

test("Plate table cell edits and block deletion leave neighboring source exact", () => {
  const source = "# Keep\n\n| A | B |\n| --- | --- |\n| old | exact |\n\nTail __unchanged__.\n";
  const model = modelFor(source);
  const value = structuredClone(model.value);
  leaves(value).find(({ node }) => node.text === "old").node.text = "new";
  assert.equal(save(model, value), source.replace("old", "new"));
  assert.equal(save(model, [value[0], value[2]]), "# Keep\n\n\nTail __unchanged__.\n");
});

test("new blocks retain existing delimiters and keep the BOM first", () => {
  const source = "\uFEFFA __bold__ claim.\r\n";
  const model = modelFor(source);
  const paragraph = { type: "p", children: [{ text: "New paragraph" }] };
  assert.equal(save(model, [...model.value, paragraph]), source + "\r\nNew paragraph\r\n");
  assert.equal(save(model, [paragraph, ...model.value]), "\uFEFFNew paragraph\r\n\r\n" + source.slice(1));
});

test("adding emphasis keeps adjacent author-chosen delimiters and entities", () => {
  const source = "A __bold__ &amp; cautious claim.\r\n";
  const model = modelFor(source);
  const value = structuredClone(model.value);
  value[0].children.splice(2, 1, { text: " & " }, { text: "cautious", italic: true }, { text: " claim." });
  assert.equal(save(model, value), source.replace("cautious", "_cautious_"));
});

test("document-scoped reference syntax falls back instead of guessing a source map", () => {
  const source = "A [reference][ref].\n\n[ref]: https://example.invalid\n\nEditable paragraph.\n";
  const model = modelFor(source);
  assert.equal(model.value[0].type, "margin_source");
  const value = structuredClone(model.value);
  value.at(-1).children[0].text = "Edited paragraph.";
  assert.equal(save(model, value), source.replace("Editable", "Edited"));
});

test("normalized inline link boundaries preserve source and clean selection anchors", () => {
  const source = '[Plain](https://example.invalid   "keep")\r\n\r\nEditable.\r\n';
  const model = modelFor(source);
  editor.tf.setValue(model.value);
  captureNormalizedValue(model, editor.children);
  assert.equal(save(model, editor.children), source);
  assert.equal(sourcePoint(model, editor.children, { path: [0, 1, 0], offset: 0 }), 1);
  const value = structuredClone(editor.children);
  value[1].children[0].text = "Edited.";
  assert.equal(save(model, value), source.replace("Editable", "Edited"));
});
