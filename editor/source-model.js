// Source remains authoritative. Plate values are a draft, never a whole-file serializer.
export function semantic(value) {
  return JSON.stringify(value, (key, item) => ["id", "marginOrigin", "marginLeaf"].includes(key) ? undefined : item);
}

export function leaves(value, path = []) {
  return value.flatMap((item, index) => typeof item.text === "string"
    ? [{ node: item, path: [...path, index] }]
    : leaves(item.children || [], [...path, index, "children"]));
}

function unsupported(block) {
  const visit = (items) => items.some((item) => ["math", "img", "input", "sup", "sub", "details"].includes(item.tag) || item.attrs?.class?.startsWith("md-") || (item.children && visit(item.children)));
  return !["paragraph", "heading", "list", "quote", "code", "table"].includes(block.kind) || /<\/?[a-z]|\[\^|\[![A-Z]/i.test(block.raw) || visit(block.tree || []);
}

export function createSourceModel(document, deserialize) {
  const groups = new Map();
  const value = [];
  for (const block of document.blocks) {
    if (block.hidden) continue;
    const key = String(block.index);
    let nodes = unsupported(block) ? [{ type: "margin_source", children: [{ text: "" }] }] : deserialize(block.raw);
    if (!nodes.length) nodes = [{ type: "margin_source", children: [{ text: "" }] }];
    nodes = structuredClone(nodes);
    let cursor = 0;
    const mappings = [];
    let unmapped = false;
    for (const { node } of leaves(nodes)) {
      const at = block.display.indexOf(node.text, cursor);
      if (at < 0 || !node.text) { if (node.text) unmapped = true; mappings.push(null); continue; }
      mappings.push({ from: at, to: at + node.text.length });
      cursor = at + node.text.length;
    }
    if (unmapped) { nodes = [{ type: "margin_source", children: [{ text: "" }] }]; mappings.splice(0, mappings.length, null); }
    nodes.forEach((node) => { node.marginOrigin = key; });
    groups.set(key, { block, nodes: structuredClone(nodes), mappings });
    value.push(...nodes);
  }
  if (!value.length) value.push({ type: "p", children: [{ text: "" }] });
  return { document, groups, value };
}

export function captureNormalizedValue(model, value) {
  // Slate inserts empty boundary leaves around inline links. Capture that clean
  // shape before edits so normalization never counts as an author change.
  for (const [key, group] of model.groups) {
    group.nodes = structuredClone(value.filter((node) => node.marginOrigin === key));
    let cursor = 0;
    group.mappings = leaves(group.nodes).map(({ node }) => {
      if (!node.text) return null;
      const from = group.block.display.indexOf(node.text, cursor);
      if (from < 0) return null;
      cursor = from + node.text.length;
      return { from, to: cursor };
    });
  }
  model.value = structuredClone(value);
}

function textOnly(group, nodes) {
  const withoutText = (value) => JSON.stringify(value, (key, item) => ["text", "id", "marginOrigin"].includes(key) ? undefined : item);
  if (withoutText(nodes) !== withoutText(group.nodes)) return null;
  const before = leaves(group.nodes);
  const after = leaves(nodes);
  const edits = [];
  for (let i = 0; i < before.length; i += 1) {
    const a = before[i].node.text;
    const b = after[i].node.text;
    if (a === b) continue;
    const mapping = group.mappings[i];
    if (!mapping || group.block.kind === "code" || before[i].node.code || /[\r\n]/.test(a + b)) return null;
    // Code points keep minimal replacements off surrogate-pair boundaries.
    const aa = Array.from(a); const bb = Array.from(b);
    let prefix = 0; let suffix = 0;
    while (prefix < aa.length && prefix < bb.length && aa[prefix] === bb[prefix]) prefix += 1;
    while (suffix < aa.length - prefix && suffix < bb.length - prefix && aa.at(-suffix - 1) === bb.at(-suffix - 1)) suffix += 1;
    const from = mapping.from + aa.slice(0, prefix).join("").length;
    const to = mapping.to - aa.slice(aa.length - suffix).join("").length;
    const { displayStarts: starts, displayEnds: ends } = group.block;
    const start = from < mapping.to ? starts[from] : ends[from - 1];
    const end = to > mapping.from ? ends[to - 1] : starts[to];
    if (start == null || end == null || end < start) return null;
    if (from === mapping.from && /^(?:\d+[.)]|[-+=])\s/.test(b)) return null;
    const text = bb.slice(prefix, bb.length - suffix).join("").replace(/[\\`*_[\]<>#!|~&$]/g, "\\$&");
    edits.push({ start, end, text });
  }
  let result = group.block.raw;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}

function addedMarks(group, nodes) {
  const structure = (value) => JSON.stringify(value.map((node) => {
    if (typeof node.text === "string") return null;
    const { children, id, marginOrigin, ...rest } = node;
    return { ...rest, children: structure(children || []) };
  }).filter(Boolean));
  if (structure(nodes) !== structure(group.nodes)) return null;
  const before = leaves(group.nodes); const after = leaves(nodes);
  if (before.map(({ node }) => node.text).join("") !== after.map(({ node }) => node.text).join("")) return null;
  const marks = ["bold", "italic", "strikethrough"];
  const left = before.flatMap(({ node }, i) => Array.from({ length: node.text.length }, (_, offset) => ({ node, offset, map: group.mappings[i] })));
  const right = after.flatMap(({ node }) => Array(node.text.length).fill(node));
  const edits = [];
  for (let i = 0; i < left.length;) {
    const additions = marks.filter((mark) => right[i][mark] && !left[i].node[mark]);
    if (marks.some((mark) => left[i].node[mark] && !right[i][mark]) || left[i].node.code !== right[i].code) return null;
    if (!additions.length) { i += 1; continue; }
    let end = i + 1;
    while (end < left.length && left[end].map === left[i].map && marks.every((mark) => Boolean(right[end][mark]) === Boolean(right[i][mark]) && Boolean(left[end].node[mark]) === Boolean(left[i].node[mark]))) end += 1;
    if (!left[i].map || left[i].node.code) return null;
    const startOffset = group.block.displayStarts[left[i].map.from + left[i].offset];
    const endOffset = group.block.displayEnds[left[end - 1].map.from + left[end - 1].offset];
    if (startOffset == null || endOffset == null) return null;
    let text = group.block.raw.slice(startOffset, endOffset);
    if (!text || /^\s|\s$/.test(text)) return null;
    for (const mark of additions) {
      const delimiter = { bold: "**", italic: "_", strikethrough: "~~" }[mark];
      text = delimiter + text + delimiter;
    }
    edits.push({ start: startOffset, end: endOffset, text });
    i = end;
  }
  if (!edits.length) return null;
  let result = group.block.raw;
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}

export function serializeDraft(model, value, serialize) {
  if (semantic(model.value) === semantic(value)) return model.document.source;
  const groups = [];
  for (const node of value) {
    const key = model.groups.has(node.marginOrigin) ? node.marginOrigin : groups.at(-1)?.key ?? null;
    if (groups.at(-1)?.key === key) groups.at(-1).nodes.push(node);
    else groups.push({ key, nodes: [node] });
  }
  const seen = new Set();
  let cursor = 0; let result = "";
  const newline = model.document.source.includes("\r\n") ? "\r\n" : "\n";
  const render = (nodes) => serialize(nodes).replace(/\r?\n/g, newline).replace(/(?:\r?\n)+$/, "");
  for (const { key, nodes } of groups) {
    const group = model.groups.get(key);
    if (!group) {
      if (cursor === 0) for (const block of model.document.blocks) {
        if (!block.hidden) break;
        result += block.raw; cursor = block.end;
      }
      result += render(nodes) + newline + newline; continue;
    }
    if (seen.has(key) || group.block.start < cursor) throw new Error("此结构移动无法保留源码，请撤销后使用源码编辑。");
    seen.add(key);
    // Removed blocks are deliberate edits; hidden separators and declarations are not.
    for (const block of model.document.blocks) if (block.start >= cursor && block.end <= group.block.start && block.hidden) result += block.raw;
    const unchanged = semantic(nodes) === semantic(group.nodes);
    const tail = group.block.raw.match(/(?:\r?\n)+$/)?.[0] || "";
    const appended = nodes.length > group.nodes.length && semantic(nodes.slice(0, group.nodes.length)) === semantic(group.nodes);
    result += unchanged ? group.block.raw : appended
      ? group.block.raw + (tail ? newline : newline + newline) + render(nodes.slice(group.nodes.length)) + tail
      : textOnly(group, nodes) ?? addedMarks(group, nodes) ?? render(nodes) + tail;
    cursor = group.block.end;
  }
  for (const block of model.document.blocks) if (block.start >= cursor && block.hidden) result += block.raw;
  return result;
}

export function sourceLeaf(model, value, path) {
  const top = value[path[0]];
  const group = model.groups.get(top?.marginOrigin);
  if (!group || semantic(value.filter((node) => node.marginOrigin === top.marginOrigin)) !== semantic(group.nodes)) return null;
  const local = value.slice(0, path[0]).filter((node) => node.marginOrigin === top.marginOrigin).length;
  const target = [local, ...path.slice(1).flatMap((index) => ["children", index])];
  const index = leaves(group.nodes).findIndex((item) => JSON.stringify(item.path) === JSON.stringify(target));
  const map = group.mappings[index];
  if (!map) return null;
  return { group, map };
}

export function sourcePoint(model, value, point, isEnd = false) {
  const mapped = sourceLeaf(model, value, point.path);
  if (!mapped) return null;
  const { group, map } = mapped;
  const at = map.from + point.offset;
  const relative = isEnd && at > map.from ? group.block.displayEnds[at - 1] : at < map.to ? group.block.displayStarts[at] : group.block.displayEnds[at - 1];
  return relative == null ? null : group.block.start + relative;
}
