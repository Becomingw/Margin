import React, { useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createPlateEditor, createPlatePlugin, ParagraphPlugin, Plate, PlateContent, PlateElement, PlateLeaf } from "platejs/react";
import { BoldPlugin, ItalicPlugin, StrikethroughPlugin, CodePlugin, H1Plugin, H2Plugin, H3Plugin, H4Plugin, H5Plugin, H6Plugin, BlockquotePlugin } from "@platejs/basic-nodes/react";
import { CodeBlockPlugin, CodeLinePlugin } from "@platejs/code-block/react";
import { IndentPlugin } from "@platejs/indent/react";
import { ListPlugin } from "@platejs/list/react";
import { TablePlugin, TableRowPlugin, TableCellPlugin, TableCellHeaderPlugin } from "@platejs/table/react";
import { MarkdownPlugin } from "@platejs/markdown";
import remarkGfm from "remark-gfm";
import { createSourceModel, captureNormalizedValue, serializeDraft, sourcePoint, sourceLeaf } from "./source-model.js";
import { intersects } from "../public/review-ranges.js";

const element = (tag) => function Element(props) {
  const item = props.element;
  const list = item.listStyleType;
  return <PlateElement {...props} as={tag} attributes={{ ...props.attributes, "data-margin-origin": item.marginOrigin }} style={{ ...(list ? { display: "list-item", listStyleType: list === "todo" ? "square" : list, marginLeft: `${item.indent || 1}em` } : {}), ...(item.align ? { textAlign: item.align } : {}) }} />;
};
const leaf = (tag) => function Leaf(props) { return <PlateLeaf {...props} as={tag} />; };
const textBlock = (node) => /^(?:p|h[1-6]|blockquote)$/.test(node.type || "");
const safeLink = (url) => url && !/[\u0000-\u0020\\]/.test(url) && !url.startsWith("//") && (!/^[a-z][a-z\d+.-]*:/i.test(url) || /^(https?:|mailto:)/i.test(url));

export function mountEditor(host, document, callbacks) {
  let model;
  function SourceElement(props) {
    const container = useRef(null);
    const group = model.groups.get(props.element.marginOrigin);
    useLayoutEffect(() => {
      if (group && container.current) container.current.replaceChildren(callbacks.fallback(group.block));
    }, [group]);
    return <PlateElement {...props} attributes={{ ...props.attributes, "data-margin-origin": props.element.marginOrigin }}>
      <div contentEditable={false} className="rich-source-block">
        <div ref={container} />
        <button type="button" onClick={() => callbacks.editSource(group?.block)}>编辑此块源码</button>
      </div>
      {props.children}
    </PlateElement>;
  }
  const plugins = [
    ParagraphPlugin.withComponent(element("p")),
    ...[H1Plugin, H2Plugin, H3Plugin, H4Plugin, H5Plugin, H6Plugin].map((plugin, i) => plugin.withComponent(element(`h${i + 1}`))),
    BlockquotePlugin.withComponent(element("blockquote")),
    BoldPlugin.withComponent(leaf("strong")), ItalicPlugin.withComponent(leaf("em")),
    StrikethroughPlugin.withComponent(leaf("s")), CodePlugin.withComponent(leaf("code")),
    CodeBlockPlugin.withComponent(element("pre")), CodeLinePlugin.withComponent(element("div")),
    IndentPlugin.configure({ inject: { targetPlugins: ["p", "h1", "h2", "h3", "blockquote"] } }), ListPlugin,
    TablePlugin.withComponent(function Table(props) { return <PlateElement {...props} as="table" attributes={{ ...props.attributes, "data-margin-origin": props.element.marginOrigin }}><tbody>{props.children}</tbody></PlateElement>; }),
    TableRowPlugin.withComponent(element("tr")), TableCellPlugin.withComponent(element("td")), TableCellHeaderPlugin.withComponent(element("th")),
    createPlatePlugin({ key: "margin_source", node: { isElement: true, isVoid: true, component: SourceElement } }),
    createPlatePlugin({ key: "a", node: { isElement: true, isInline: true, component: (props) => <PlateElement {...props} as="a" attributes={{ ...props.attributes, href: safeLink(props.element.url) ? props.element.url : undefined, onClick: (event) => event.preventDefault() }} /> } }),
    createPlatePlugin({ key: "reviewHighlight", node: { isLeaf: true, component: leaf("mark") } }),
    MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } }),
  ];
  const editor = createPlateEditor({ plugins });
  const markdown = editor.getApi(MarkdownPlugin).markdown;
  model = createSourceModel(document, (raw) => markdown.deserialize(raw));
  editor.tf.withoutSaving(() => editor.tf.setValue(model.value));
  captureNormalizedValue(model, editor.children);
  const initial = JSON.stringify(editor.children);
  const draft = () => JSON.stringify(editor.children) === initial ? document.source : serializeDraft(model, editor.children, (value) => markdown.serialize({ value, preserveEmptyParagraphs: false }));
  const changed = () => {
    try { callbacks.change(draft() !== document.source); }
    catch (error) { callbacks.change(true, error.message); }
  };
  const syncSelection = () => {
    // Slate defers DOM selection changes. Toolbar commands must use the visible
    // selection, especially immediately after typing or moving between cells.
    const selection = editor.api.toSlateRange(window.getSelection(), { exactMatch: false, suppressThrow: true });
    if (selection) editor.tf.select(selection);
  };
  const action = (label, fn) => <button type="button" key={label}
    onMouseDown={(event) => { event.preventDefault(); syncSelection(); }}
    onClick={() => { syncSelection(); fn(); editor.tf.focus(); }}>{label}</button>;
  const root = createRoot(host);
  root.render(<Plate editor={editor} onValueChange={changed}>
    <div className="rich-formatting" role="toolbar" aria-label="正文格式">
      {action("粗体", () => editor.tf.toggleMark("bold"))}
      {action("斜体", () => editor.tf.toggleMark("italic"))}
      {action("删除线", () => editor.tf.toggleMark("strikethrough"))}
      {action("行内代码", () => editor.tf.toggleMark("code"))}
      {action("段落", () => { editor.tf.setNodes({ type: "p" }, { match: textBlock }); editor.tf.unsetNodes(["listStyleType", "indent"], { match: textBlock }); })}
      {action("标题", () => editor.tf.setNodes({ type: "h2" }, { match: textBlock }))}
      {action("列表", () => editor.tf.setNodes({ listStyleType: "disc", indent: 1 }, { match: (node) => ["p", "h1", "h2", "h3"].includes(node.type) }))}
      {action("表格", () => editor.getTransforms(TablePlugin).insert.table({ rowCount: 2, colCount: 2 }, { select: true }))}
      {action("添加行", () => editor.getTransforms(TablePlugin).insert.tableRow())}
      {action("链接", () => {
        if (!editor.selection) return;
        const url = window.prompt("链接地址（http、https、mailto 或项目内相对路径）");
        if (!url) return;
        if (!safeLink(url)) { callbacks.message("链接地址无效，请使用 http、https 或项目内相对路径。"); return; }
        editor.tf.unwrapNodes({ match: (node) => node.type === "a", split: true });
        editor.tf.wrapNodes({ type: "a", url, children: [] }, { match: (node) => typeof node.text === "string", split: true });
      })}
      {action("撤销", () => editor.undo())}{action("重做", () => editor.redo())}
    </div>
    <PlateContent className="rich-content markdown-content" aria-label="直接编辑 Markdown 正文" spellCheck={false}
      decorate={({ entry: [node, path] }) => {
        if (typeof node.text !== "string" || !callbacks.ranges?.length) return [];
        const mapped = sourceLeaf(model, editor.children, path);
        if (!mapped) return [];
        const { block } = mapped.group;
        const ranges = [];
        let start = null;
        for (let i = 0; i <= node.text.length; i += 1) {
          const offset = mapped.map.from + i;
          const marked = i < node.text.length && block.displayStarts[offset] != null && intersects(callbacks.ranges, block.start + block.displayStarts[offset], block.start + block.displayEnds[offset]);
          if (marked && start === null) start = i;
          if (!marked && start !== null) { ranges.push({ anchor: { path, offset: start }, focus: { path, offset: i }, reviewHighlight: true }); start = null; }
        }
        return ranges;
      }}
      onPaste={(event) => {
        // Plain text paste never imports executable HTML, remote assets or source identities.
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        editor.tf.insertText(text);
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); callbacks.save(); }
      }} />
  </Plate>);
  return {
    source: draft,
    selection() {
      // The document listener can run before Slate's deferred selection handler.
      const selection = editor.api.toSlateRange(window.getSelection(), { exactMatch: false, suppressThrow: true });
      if (!selection) return null;
      try { if (draft() !== document.source) return null; }
      catch { return null; }
      const forward = JSON.stringify(selection.anchor.path) === JSON.stringify(selection.focus.path)
        ? selection.anchor.offset <= selection.focus.offset
        : selection.anchor.path.some((n, i) => n !== selection.focus.path[i] && n < selection.focus.path[i] && selection.anchor.path.slice(0, i).every((x, j) => x === selection.focus.path[j]));
      const start = sourcePoint(model, editor.children, forward ? selection.anchor : selection.focus);
      const end = sourcePoint(model, editor.children, forward ? selection.focus : selection.anchor, true);
      return start != null && end != null && end > start ? { start, end, quote: document.source.slice(start, end) } : null;
    },
    destroy() { root.unmount(); },
  };
}
