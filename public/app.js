const $ = (selector) => document.querySelector(selector);
const desktop = window.marginDesktop;
const state = { bootstrap: null, document: null, review: null, view: "current", tab: "comments", selection: null, composer: null, loading: 0, busy: false };
const labels = { "document-opened": "打开文档", edit: "修订正文", restore: "恢复版本", "external-change": "外部修改", "comment-created": "添加批注", "comment-reply": "回复批注", "comment-edit": "编辑批注", "comment-resolve": "解决批注", "comment-reopen": "重新打开批注", "comment-delete": "删除批注", "comment-restore": "恢复批注", checkpoint: "开始新一轮", "package-imported": "导入审阅包" };
const statuses = { open: "未解决", resolved: "已解决", deleted: "已删除", attached: "已定位", modified: "原文已修改", unlocated: "待重新定位" };
const latest = () => state.review?.document.revisions.at(-1);
const baseline = () => state.review?.document.revisions.find((item) => item.id === state.review.document.baselineId);

async function api(url, body) {
  let response;
  try {
    response = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-Margin": "1" }, body: JSON.stringify(body) });
  } catch { throw new Error(desktop ? "本地服务未响应，请从工作区首页重新打开项目。" : "本地服务未响应，请检查运行 Margin 的终端。"); }
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "操作未完成，请重试。");
  return value;
}
function node(tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $("#toast").hidden = true; }, 6000);
}
function button(text, action, className = "") {
  const element = node("button", text, className);
  element.type = "button";
  element.addEventListener("click", async () => {
    element.disabled = true;
    try { await action(); } catch (error) { toast(error.message); }
    finally { element.disabled = false; }
  });
  return element;
}
async function refreshBootstrap() {
  state.bootstrap = await api("/api/bootstrap");
  $("#project-title").textContent = state.bootstrap.title;
  const selected = state.document?.path;
  $("#document-select").replaceChildren(...state.bootstrap.documents.map((item) => {
    const option = node("option", item.label);
    option.value = item.path;
    return option;
  }));
  if (selected) $("#document-select").value = selected;
}
async function loadDocument(path) {
  const generation = ++state.loading;
  const payload = await api(`/api/document?path=${encodeURIComponent(path)}`);
  const review = payload.readOnly ? null : await api(`/api/review?path=${encodeURIComponent(path)}`);
  if (generation !== state.loading) return;
  if (review && review.document.revisions.at(-1).hash !== payload.etag) throw new Error("读取期间文件发生变化，请重新载入。");
  state.document = payload;
  state.review = review;
  if (!state.bootstrap.documents.some((item) => item.path === path)) {
    state.bootstrap.documents.push({ path, label: path });
    const option = node("option", path);
    option.value = path;
    $("#document-select").append(option);
  }
  state.selection = null;
  $("#selection-actions").hidden = true;
  $("#document-select").value = path;
  $("#document-title").textContent = path.split("/").at(-1);
  $("#document-info").textContent = `${/\.md$/i.test(path) ? "Markdown" : "LaTeX"} · ${payload.source.length.toLocaleString()} 字符${review ? ` · ${review.document.revisions.length} 个版本` : ""}`;
  $("#encoding-notice").hidden = !payload.readOnly;
  $("#encoding-notice").textContent = payload.encoding?.message || "";
  $("#external-notice").hidden = true;
  for (const selector of ["#edit-source", "#document-comment", "#checkpoint"]) $(selector).disabled = payload.readOnly;
  $("#document-total").textContent = state.bootstrap.documents.length;
  try { sessionStorage.setItem("margin.review.document", path); } catch { /* optional storage */ }
  await renderDocument();
  if (generation !== state.loading) return;
  renderReview();
  $("#document").dataset.path = path;
}

function diffOperations(before, after) {
  const tokens = (text) => text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];
  const a = tokens(before);
  const b = tokens(after);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix += 1;
  const left = a.slice(prefix, a.length - suffix);
  const right = b.slice(prefix, b.length - suffix);
  const result = [];
  const push = (kind, text) => {
    if (!text) return;
    if (result.at(-1)?.kind === kind) result.at(-1).text += text;
    else result.push({ kind, text });
  };
  push("same", a.slice(0, prefix).join(""));
  if (left.length * right.length > 300000) { push("delete", left.join("")); push("insert", right.join("")); }
  else {
    const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
    for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) { push("same", left[i++]); j += 1; }
      else if (i < left.length && (j === right.length || table[i + 1][j] >= table[i][j + 1])) push("delete", left[i++]);
      else push("insert", right[j++]);
    }
  }
  push("same", suffix ? a.slice(-suffix).join("") : "");
  return result;
}
function appendDiff(container, before, after) {
  for (const part of diffOperations(before, after)) container.append(node(part.kind === "delete" ? "del" : part.kind === "insert" ? "ins" : "span", part.text));
}
function appendMappedText(element, block) {
  const comments = (state.review?.comments || []).filter((item) => item.status === "open" && ["attached", "modified"].includes(item.anchor.status));
  const display = block.display || "";
  const markedAt = (i) => comments.some((item) => item.anchor.start < block.start + (block.displayEnds?.[i] ?? 0) && item.anchor.end > block.start + (block.displayStarts?.[i] ?? 0));
  const math = (block.annotations || []).filter((item) => item.type === "math");
  const signature = (i) => `${state.view === "current" && markedAt(i) ? "marked" : ""} ${(block.styles || []).filter((style) => style.start <= i && style.end > i).map((style) => `style-${style.type}`).join(" ")}`;
  for (let i = 0; i < display.length;) {
    const formula = math.find((item) => item.start === i && item.end > i);
    if (formula && window.katex) {
      const atom = node("span", "", "math-atom");
      atom.dataset.displayText = display.slice(formula.start, formula.end);
      atom.dataset.displayStart = String(formula.start);
      atom.dataset.displayEnd = String(formula.end);
      window.katex.render(formula.latex, atom, { throwOnError: false, trust: false, strict: "ignore", displayMode: Boolean(formula.display), macros: { ...(state.document.mathMacros || {}) } });
      if (state.view === "current" && markedAt(i)) atom.classList.add("marked");
      element.append(atom);
      i = formula.end;
    } else {
      const style = signature(i);
      let end = i + 1;
      while (end < display.length && !math.some((item) => item.start === end) && signature(end) === style) end += 1;
      element.append(node("span", display.slice(i, end), style));
      i = end;
    }
  }
}

function markdownTarget(value) {
  if (!value || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//") || /[\u0000-\u001f\\]/.test(value)) return null;
  try {
    const url = new URL(value, `http://margin.invalid/${state.document.path.split("/").map(encodeURIComponent).join("/")}`);
    if (url.origin !== "http://margin.invalid") return null;
    const path = decodeURIComponent(url.pathname.slice(1));
    if (/[\u0000-\u001f\\]/.test(path)) return null;
    return { path, hash: decodeURIComponent(url.hash.slice(1)) };
  } catch { return null; }
}

function appendMarkdown(element, block) {
  const comments = (state.review?.comments || []).filter((item) => item.status === "open" && ["attached", "modified"].includes(item.anchor.status));
  const marked = (i) => state.view === "current" && block.displayStarts[i] !== null && comments.some((item) => item.anchor.start < block.start + block.displayEnds[i] && item.anchor.end > block.start + block.displayStarts[i]);
  function render(item) {
    if (item.tag === "math") {
      const atom = node("span", "", `md-leaf md-math${item.display ? " md-math-block" : ""}`);
      atom.dataset.mdFrom = item.from; atom.dataset.mdTo = item.to; atom.dataset.mdAtomic = "true";
      atom.setAttribute("aria-label", item.latex);
      if (item.svg) {
        function mathNode(item) {
          if (item.text !== undefined) return document.createTextNode(item.text);
          const result = item.tag === "mjx-container" ? node(item.tag) : document.createElementNS("http://www.w3.org/2000/svg", item.tag);
          for (const [name, value] of Object.entries(item.attrs)) result.setAttribute(name, value);
          for (const child of item.children) result.append(mathNode(child));
          return result;
        }
        for (const root of item.svg) atom.append(mathNode(root));
      } else {
        atom.append(node("code", item.latex));
        if (item.error) {
          atom.classList.add("md-math-error");
          atom.title = `${item.error}；可选中公式修订源码。`;
          atom.append(node("small", "公式未渲染", "math-error-label"));
        }
      }
      if (marked(item.from)) atom.classList.add("marked");
      return atom;
    }
    if (item.tag === "img") {
      const wrapper = node("span", "", "md-leaf md-image");
      wrapper.dataset.mdFrom = item.from; wrapper.dataset.mdTo = item.to; wrapper.dataset.mdAtomic = "true";
      if (marked(item.from)) wrapper.classList.add("marked");
      const target = markdownTarget(item.attrs.src);
      if (target && /\.(png|jpe?g|gif|webp|svg)$/i.test(target.path)) {
        const image = node("img");
        image.alt = item.attrs.alt || "图片";
        image.loading = "lazy";
        for (const name of ["width", "height", "title"]) if (item.attrs[name]) image.setAttribute(name, item.attrs[name]);
        image.src = `/api/asset?path=${encodeURIComponent(target.path)}`;
        image.addEventListener("error", () => { wrapper.textContent = `${image.alt}（图片未找到）`; wrapper.classList.add("md-image-placeholder"); });
        wrapper.append(image);
      } else {
        wrapper.textContent = `${item.text}${item.remote ? "（远程图片未加载）" : "（图片不可用）"}`;
        wrapper.classList.add("md-image-placeholder");
      }
      return wrapper;
    }
    if (item.text !== undefined) {
      const leaf = node("span", "", "md-leaf");
      leaf.dataset.mdFrom = item.from; leaf.dataset.mdTo = item.to;
      if (!item.mapped) leaf.dataset.mdUnmapped = "true";
      for (let i = item.from; i < item.to;) {
        const active = marked(i);
        let end = i + 1;
        while (end < item.to && marked(end) === active) end += 1;
        leaf.append(node("span", block.display.slice(i, end), active ? "marked" : ""));
        i = end;
      }
      return leaf;
    }
    const result = node(item.tag);
    for (const [name, value] of Object.entries(item.attrs || {})) result.setAttribute(name, value);
    for (const child of item.children || []) result.append(render(child));
    if (item.tag === "a" && item.attrs.href) {
      result.addEventListener("click", async (event) => {
        event.preventDefault();
        if (!window.getSelection().isCollapsed) return;
        try {
          if (/^(https?:|mailto:)/i.test(item.attrs.href)) {
            if (desktop) await desktop.openLink(item.attrs.href);
            else window.open(item.attrs.href, "_blank", "noopener,noreferrer");
            return;
          }
          const target = markdownTarget(item.attrs.href);
          if (!target) return;
          if (target.path !== state.document.path) {
            if (!/\.(md|tex)$/i.test(target.path)) { toast("此链接不是可审阅的 Markdown 或 LaTeX 文档。"); return; }
            if ($("#composer").open) return;
            await loadDocument(target.path);
          }
          if (target.hash) {
            const id = target.hash.startsWith("md-") ? target.hash : `md-${target.hash}`;
            const destination = document.getElementById(id);
            for (let parent = destination?.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true;
            destination?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } catch (error) { toast(error.message); }
      });
    }
    if (/^h[1-6]$/.test(item.tag)) {
      const link = button(result.textContent, () => result.scrollIntoView({ behavior: "smooth", block: "start" }));
      link.style.paddingLeft = `${12 + (Number(item.tag[1]) - 1) * 12}px`;
      $("#outline").append(link);
    }
    if (item.tag === "table") { const scroll = node("div", "", "md-table-scroll"); scroll.tabIndex = 0; scroll.setAttribute("aria-label", "表格，可横向滚动"); scroll.append(result); return scroll; }
    return result;
  }
  element.dataset.markdown = "true";
  element.classList.add("markdown-content");
  for (const item of block.tree) element.append(render(item));
}

function markdownOffset(root, container, offset, isEnd) {
  const parent = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  const leaf = parent.closest(".md-leaf");
  if (leaf && root.contains(leaf)) {
    if (leaf.dataset.mdUnmapped) return null;
    if (leaf.dataset.mdAtomic) return Number(isEnd ? leaf.dataset.mdTo : leaf.dataset.mdFrom);
    const range = document.createRange();
    range.selectNodeContents(leaf); range.setEnd(container, offset);
    return Number(leaf.dataset.mdFrom) + range.toString().length;
  }
  let previous = null;
  for (const item of root.querySelectorAll(".md-leaf")) {
    const range = document.createRange(); range.selectNode(item);
    if (range.comparePoint(container, offset) <= 0) return Number(isEnd && previous ? previous.dataset.mdTo : item.dataset.mdFrom);
    previous = item;
  }
  return previous ? Number(previous.dataset.mdTo) : null;
}

async function renderDocument() {
  const payload = state.document;
  if (!payload) return;
  const generation = state.loading;
  const view = state.view;
  const target = $("#document");
  if (view === "changes" && state.review) {
    target.replaceChildren(node("p", "本轮原稿 → 当前正文 · 源码修订（删除线为删除，下划线为新增）", "hint"));
    const diff = node("pre", "", "source-diff");
    appendDiff(diff, baseline().source, payload.source);
    target.append(diff);
    return;
  }
  const visible = view === "original" && state.review ? await api(`/api/review/render?path=${encodeURIComponent(payload.path)}&revision=${encodeURIComponent(baseline().id)}`) : payload;
  if (generation !== state.loading || view !== state.view) return;
  target.replaceChildren();
  $("#outline").replaceChildren();
  if (visible.frontMatter?.title) target.append(node("h1", visible.frontMatter.title.display || visible.frontMatter.title.text || visible.frontMatter.title));
  for (const block of visible.blocks) {
    if (block.hidden || (!block.tree && !block.display?.trim())) continue;
    const section = node("section", "", `text-block kind-${block.kind}`);
    section.id = `block-${block.index}`;
    const content = node(block.tree ? "div" : block.kind === "heading" ? `h${Math.min(6, block.level || 2)}` : ["code", "table"].includes(block.kind) ? "pre" : "div", "", "block-content");
    content.dataset.blockIndex = String(block.index);
    const semantic = block.semantic;
    if (block.tree) appendMarkdown(content, block);
    else if (semantic && ["code", "table", "figure", "bibliography"].includes(block.kind)) {
      content.dataset.wholeBlock = "true";
      if (block.kind === "code") content.append(node("span", semantic.text || block.raw));
      else if (block.kind === "table") {
        if (semantic.caption) content.append(node("div", semantic.caption));
        const table = node("table");
        for (const [index, row] of (semantic.formattedRows || []).entries()) {
          const tr = node("tr");
          for (const cell of row) {
            const td = node(index < semantic.headerRows ? "th" : "td", cell.text);
            td.colSpan = cell.colspan || 1;
            td.rowSpan = cell.rowspan || 1;
            tr.append(td);
          }
          table.append(tr);
        }
        content.append(table);
        if (!table.childNodes.length) content.append(node("span", block.raw));
      } else if (block.kind === "figure") {
        const graphics = semantic.panels?.map((item) => item.graphic) || [semantic.graphic];
        for (const graphic of graphics.filter(Boolean)) {
          if (!["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(graphic.type)) continue;
          const image = document.createElement("img");
          image.src = `/api/asset?path=${encodeURIComponent(graphic.path)}`;
          image.alt = semantic.caption || graphic.path;
          content.append(image);
        }
        content.append(node("span", semantic.caption || block.display));
      } else for (const item of semantic.items || []) content.append(node("p", `[${item.label}] ${item.text}`));
    } else if (semantic?.latex && block.kind === "math") appendMappedText(content, { ...block, annotations: [{ type: "math", latex: semantic.latex, start: 0, end: block.display.length, display: true }] });
    else appendMappedText(content, block);
    section.append(content);
    if (block.kind === "heading" && !block.tree) {
      const link = button(block.display.trim(), () => section.scrollIntoView({ behavior: "smooth", block: "start" }));
      link.style.paddingLeft = `${12 + ((block.level || 1) - 1) * 12}px`;
      $("#outline").append(link);
    }
    if (state.view === "current" && !payload.readOnly) {
      const actions = node("div", "", "block-actions");
      actions.append(button("批注", () => openComposer("comment", { start: block.start, end: block.end, quote: block.raw })), button("编辑", () => openComposer("replace", { start: block.start, end: block.end, quote: block.raw })), button("删除", () => openComposer("delete", { start: block.start, end: block.end, quote: block.raw })));
      section.append(actions);
    }
    target.append(section);
  }
  if (!target.querySelector(".text-block")) {
    target.append(node("p", "本文件没有可显示的正文。可编辑源码，或打开项目中的其他文档：", "empty"));
    for (const item of state.bootstrap.documents.filter((item) => item.path !== payload.path)) target.append(button(item.label, () => loadDocument(item.path), "document-link"));
  }
}
function clearSelectionActions() {
  state.selection = null;
  $("#selection-actions").hidden = true;
}
function selectText() {
  clearSelectionActions();
  if (state.view !== "current" || !state.review || $("#composer").open) return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const contentFor = (container) => (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement)?.closest(".block-content");
  const first = contentFor(range.startContainer);
  const last = contentFor(range.endContainer);
  if (!first || !last || !$("#document").contains(first) || !$("#document").contains(last)) return;
  const offsetAt = (root, container, offset, isEnd) => {
    if (root.dataset.markdown) return markdownOffset(root, container, offset, isEnd);
    const atom = (container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement)?.closest(".math-atom");
    if (atom) return Number(isEnd ? atom.dataset.displayEnd : atom.dataset.displayStart);
    const partial = document.createRange();
    partial.selectNodeContents(root);
    partial.setEnd(container, offset);
    const fragment = partial.cloneContents();
    fragment.querySelectorAll(".math-atom").forEach((math) => { math.textContent = math.dataset.displayText; });
    return fragment.textContent.length;
  };
  const startBlock = state.document.blocks[Number(first.dataset.blockIndex)];
  const endBlock = state.document.blocks[Number(last.dataset.blockIndex)];
  if (!startBlock || !endBlock) return;
  const startOffset = offsetAt(first, range.startContainer, range.startOffset);
  const endOffset = offsetAt(last, range.endContainer, range.endOffset, true);
  if (startOffset === null || endOffset === null || startBlock.displayStarts[startOffset] === null || endBlock.displayEnds[endOffset - 1] === null) return;
  const start = first.dataset.wholeBlock ? startBlock.start : startBlock.start + (startBlock.displayStarts[startOffset] ?? startBlock.raw.length);
  const end = last.dataset.wholeBlock ? endBlock.end : endBlock.start + (endBlock.displayEnds[endOffset - 1] ?? 0);
  if (end <= start) return;
  state.selection = { start, end, quote: state.document.source.slice(start, end) };
  const bounds = range.getBoundingClientRect();
  $("#selection-actions").hidden = false;
  $("#selection-actions").style.left = `${Math.max(8, Math.min(window.innerWidth - 250, bounds.left))}px`;
  $("#selection-actions").style.top = `${Math.max(8, Math.min(window.innerHeight - 50, bounds.bottom + 8))}px`;
}
function openComposer(mode, selection = null, comment = null) {
  if (!state.review) return;
  state.composer = { mode, selection, comment, path: state.document.path, etag: state.document.etag };
  const edit = ["replace", "delete", "source"].includes(mode);
  const title = { comment: "添加批注", reply: "回复批注", "edit-comment": "编辑批注", replace: "修订选区（源码）", delete: "删除选区", source: "编辑完整源码" }[mode];
  $("#composer-title").textContent = title;
  $("#composer-quote").textContent = (selection?.quote || comment?.original.quote || "全文批注").slice(0, 600);
  $("#composer-quote").hidden = mode === "source";
  $("#body-label").textContent = edit ? "替换后的内容（保留 Markdown / LaTeX 标记；留空表示删除）" : "批注内容";
  $("#composer-body").required = !edit;
  $("#composer-body").value = mode === "source" ? state.document.source : mode === "replace" ? selection.quote : mode === "edit-comment" ? comment.body : "";
  $("#composer-reason").value = "";
  for (const selector of ["#reason-label", "#composer-reason", "#linked-label", "#composer-linked"]) $(selector).hidden = !edit;
  $("#composer-linked").replaceChildren(new Option("无", ""), ...state.review.comments.filter((item) => item.status !== "deleted").map((item) => new Option(`${item.body.slice(0, 60)} · ${item.id}`, item.id)));
  $("#composer-error").textContent = "";
  $("#composer-submit").textContent = edit ? "保存修订" : "保存批注";
  $("#selection-actions").hidden = true;
  $("#composer").showModal();
  $("#composer-body").focus();
}
function closeComposer() {
  if (state.busy) return;
  $("#composer").close();
  state.composer = null;
}
async function submitComposer(event) {
  event.preventDefault();
  if (state.busy) return;
  state.busy = true;
  $("#composer-submit").disabled = true;
  const draft = state.composer;
  let text = $("#composer-body").value;
  const originalText = draft.mode === "source" ? state.document.source : draft.selection?.quote;
  if (["replace", "delete", "source"].includes(draft.mode) && originalText) {
    // Textareas normalise CRLF. Retain untouched line endings, including mixed
    // files, by replacing only the changed portion of the normalised text.
    const normalized = originalText.replace(/\r\n?/g, "\n");
    let start = 0;
    while (start < normalized.length && start < text.length && normalized[start] === text[start]) start += 1;
    let end = normalized.length;
    let nextEnd = text.length;
    while (end > start && nextEnd > start && normalized[end - 1] === text[nextEnd - 1]) { end -= 1; nextEnd -= 1; }
    const offsets = [];
    for (let i = 0; i < originalText.length; i += 1) { offsets.push(i); if (originalText[i] === "\r" && originalText[i + 1] === "\n") i += 1; }
    offsets.push(originalText.length);
    const newline = originalText.match(/\r\n|\n|\r/)?.[0] || state.document.source.match(/\r\n|\n|\r/)?.[0] || "\n";
    text = originalText.slice(0, offsets[start]) + text.slice(start, nextEnd).replace(/\n/g, newline) + originalText.slice(offsets[end]);
  }
  try {
    if (["replace", "delete", "source"].includes(draft.mode)) {
      const linked = $("#composer-linked").value;
      await api("/api/review/save", { path: draft.path, etag: draft.etag, text, ...(draft.selection ? { start: draft.selection.start, end: draft.selection.end } : {}), reason: $("#composer-reason").value, commentIds: linked ? [linked] : [] });
    } else if (["reply", "edit-comment"].includes(draft.mode)) {
      await api("/api/review/comment-update", { id: draft.comment.id, expectedUpdatedAt: draft.comment.updatedAt || draft.comment.createdAt, action: draft.mode === "reply" ? "reply" : "edit", body: text });
    } else {
      const anchor = draft.selection || { start: 0, end: 0 };
      const heading = state.document.blocks.filter((block) => block.kind === "heading" && block.start <= anchor.start).at(-1)?.display.trim() || "全文";
      await api("/api/review/comment", { path: draft.path, etag: draft.etag, start: anchor.start, end: anchor.end, body: text, heading });
    }
    $("#composer").close();
    state.composer = null;
    await loadDocument(draft.path);
    toast("已保存，审阅历史已记录。");
  } catch (error) { $("#composer-error").textContent = error.message; }
  finally { state.busy = false; $("#composer-submit").disabled = false; }
}
async function updateComment(comment, action) {
  await api("/api/review/comment-update", { id: comment.id, action, expectedUpdatedAt: comment.updatedAt || comment.createdAt });
  await loadDocument(state.document.path);
}
function focusComment(comment) {
  if (!["attached", "modified"].includes(comment.anchor.status)) { toast("原始位置已变化，请在修订记录中查看原文。"); return; }
  const block = state.document.blocks.find((item) => item.end > comment.anchor.start && item.start <= comment.anchor.start);
  if (block) {
    const element = $(`#block-${block.index}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.classList.add("focused");
    setTimeout(() => element?.classList.remove("focused"), 1800);
  }
}
function renderReview() {
  const container = $("#review-list");
  container.replaceChildren();
  $("#comment-filter-label").hidden = state.tab !== "comments";
  $("#comment-count").textContent = state.review?.comments.filter((item) => item.status === "open").length || 0;
  if (!state.review) { container.append(node("p", "此文件只读。", "empty")); return; }
  if (state.tab === "comments") {
    const filter = $("#comment-filter").value;
    for (const comment of state.review.comments.filter((item) => filter === "all" || item.status === filter)) {
      const card = node("article", "", "review-card");
      card.id = comment.id;
      card.append(node("div", `${statuses[comment.status]} · ${comment.anchor.status === "deleted" ? "原文已删除" : statuses[comment.anchor.status]}`, "card-meta"));
      const identifier = node("small", comment.id, "identifier");
      card.append(button(comment.original.heading || "全文", () => focusComment(comment), "text-button"));
      if (comment.original.quote) card.append(node("blockquote", comment.original.quote));
      card.append(node("p", comment.body, "comment-body"));
      for (const reply of comment.replies) card.append(node("p", reply.body, "reply"));
      const actions = node("div", "", "card-actions");
      if (comment.status === "deleted") actions.append(button("恢复批注", () => updateComment(comment, "restore")));
      else actions.append(button("回复", () => openComposer("reply", null, comment)), button("编辑", () => openComposer("edit-comment", null, comment)), button(comment.status === "open" ? "解决" : "重新打开", () => updateComment(comment, comment.status === "open" ? "resolve" : "reopen")), button("删除", () => updateComment(comment, "delete")));
      card.append(actions);
      const details = node("details", "", "record-details");
      details.append(node("summary", "记录详情"), identifier, node("small", new Date(comment.createdAt).toLocaleString(), "muted"));
      card.append(details);
      container.append(card);
    }
  } else {
    for (const record of [...state.review.events].reverse().filter((item) => state.tab === "history" || item.resultRevision)) {
      const card = node("article", "", "review-card");
      card.append(node("strong", labels[record.type] || record.type), node("small", new Date(record.createdAt).toLocaleString(), "card-meta"), node("small", record.id, "identifier"));
      if (record.resultRevision) {
        const diff = node("div", "", "change-diff");
        appendDiff(diff, record.before, record.after);
        card.append(diff);
        if (record.reason) card.append(node("p", record.reason));
        for (const commentId of record.commentIds || []) {
          const comment = state.review.comments.find((item) => item.id === commentId);
          if (comment) card.append(node("p", `关联批注：${comment.body}`, "reply"));
        }
        card.append(button("恢复到此次修改前", async () => {
          if (!window.confirm("将以一条新的修订恢复该历史版本，后续历史仍会保留。继续？")) return;
          await api("/api/review/restore", { path: state.document.path, etag: state.document.etag, revisionId: record.baseRevision });
          await loadDocument(state.document.path);
        }));
      } else {
        if (record.after?.body) card.append(node("p", record.after.body));
        if (record.before?.body && record.before.body !== record.after?.body) card.append(node("blockquote", record.before.body));
        if (record.type === "comment-reply") card.append(node("p", record.after.replies.at(-1)?.body || ""));
        if (record.label) card.append(node("p", record.label));
      }
      container.append(card);
    }
  }
  if (!container.childNodes.length) container.append(node("p", state.tab === "comments" ? "选中正文添加批注，或直接修订文字。所有操作都会保留记录。" : "尚无修订记录。", "empty"));
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = node("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function fileBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
async function importFiles(input, packaged) {
  try {
    const files = [...input.files];
    if (!files.length) return;
    if (files.reduce((total, file) => total + file.size, 0) > 32 * 1024 * 1024) throw new Error("导入大小不能超过 32 MiB。");
    const body = packaged ? { package: await fileBase64(files[0]) } : { files: await Promise.all(files.map(async (file) => ({ path: file.webkitRelativePath || file.name, content: await fileBase64(file) }))) };
    const result = await api("/api/review/import", body);
    await refreshBootstrap();
    state.view = "current";
    document.querySelectorAll("[data-view]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.view === state.view)));
    await loadDocument(result.documents[0].path);
    toast(packaged ? "审阅包已恢复到独立目录，原有文件未被覆盖。" : "文档已导入，原始基线已保存。");
  } catch (error) { toast(error.message); }
  finally { input.value = ""; }
}
function bind(selector, action) { $(selector).addEventListener("click", () => Promise.resolve().then(action).catch((error) => toast(error.message))); }
bind("#import-files", () => $("#files-input").click());
bind("#import-folder", () => $("#folder-input").click());
bind("#import-package", () => desktop ? desktop.importPackage() : $("#package-input").click());
$("#files-input").addEventListener("change", (event) => importFiles(event.target, false));
$("#folder-input").addEventListener("change", (event) => importFiles(event.target, false));
$("#package-input").addEventListener("change", (event) => importFiles(event.target, true));
bind("#export-package", async () => {
  if (desktop) { const result = await desktop.exportPackage(); if (result?.saved) toast(`已导出审阅包：${result.name}`); return; }
  const response = await fetch("/api/review/export");
  if (!response.ok) throw new Error((await response.json()).error);
  download(await response.blob(), "margin-review.zip");
  toast("已导出完整审阅包，REVIEW.md 可直接交给其他审阅者或 Agent。");
});
bind("#export-document", async () => {
  if (desktop) { const result = await desktop.exportDocument(state.document.path); if (result?.saved) toast(`已导出正文：${result.name}`); return; }
  download(new Blob([state.document.source], { type: "text/plain;charset=utf-8" }), state.document.path.split("/").at(-1));
});
bind("#edit-source", () => openComposer("source"));
bind("#document-comment", () => openComposer("comment"));
bind("#selection-comment", () => { if (state.selection) openComposer("comment", state.selection); });
bind("#selection-replace", () => { if (state.selection) openComposer("replace", state.selection); });
bind("#reload", () => loadDocument(state.document.path));
bind("#checkpoint", async () => {
  if (!window.confirm("以当前正文开始新一轮审阅？已有批注和修订历史将完整保留。")) return;
  await api("/api/review/checkpoint", { path: state.document.path, etag: state.document.etag });
  await loadDocument(state.document.path);
});
bind("#composer-close", closeComposer);
bind("#composer-cancel", closeComposer);
$("#composer").addEventListener("cancel", (event) => { if (state.busy) event.preventDefault(); else state.composer = null; });
$("#composer-form").addEventListener("submit", submitComposer);
$("#document-select").addEventListener("change", (event) => loadDocument(event.target.value).catch((error) => toast(error.message)));
$("#comment-filter").addEventListener("change", renderReview);
$("#document").addEventListener("pointerup", () => setTimeout(selectText, 0));
$("#document").addEventListener("keyup", selectText);
document.addEventListener("selectionchange", selectText);
$("#selection-actions").addEventListener("pointerdown", (event) => {
  // Keep the document selection alive until a pointer click opens its composer.
  if (event.button === 0) event.preventDefault();
});
document.addEventListener("pointerdown", (event) => { if (!event.target.closest("#selection-actions")) clearSelectionActions(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#composer").open && !$("#selection-actions").hidden) {
    window.getSelection()?.removeAllRanges();
    clearSelectionActions();
  }
});
window.addEventListener("blur", clearSelectionActions);
document.querySelectorAll("[data-view]").forEach((element) => element.addEventListener("click", () => {
  state.view = element.dataset.view;
  state.selection = null;
  $("#selection-actions").hidden = true;
  document.querySelectorAll("[data-view]").forEach((item) => item.setAttribute("aria-pressed", String(item === element)));
  renderDocument().catch((error) => toast(error.message));
}));
document.querySelectorAll("[data-tab]").forEach((element) => element.addEventListener("click", () => {
  state.tab = element.dataset.tab;
  document.querySelectorAll("[data-tab]").forEach((item) => item.setAttribute("aria-pressed", String(item === element)));
  renderReview();
}));
bind("#theme", async () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("margin.review.theme", document.documentElement.dataset.theme); } catch { /* optional */ }
  if (desktop) await desktop.theme(document.documentElement.dataset.theme);
});
window.addEventListener("beforeunload", (event) => { if (state.composer) { event.preventDefault(); event.returnValue = ""; } });
if (desktop) {
  $("#desktop-home").hidden = false;
  bind("#desktop-home", () => desktop.home());
  desktop.onMenuAction((action) => {
    if (action === "save") {
      if ($("#composer").open) $("#composer-form").requestSubmit();
      else toast("当前正文与审阅记录已保存。");
    } else if (["export-document", "export-package"].includes(action)) $(`#${action}`).click();
  });
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) desktop.openDropped(file).catch((error) => toast(error.message));
  });
}
async function start() {
  try { document.documentElement.dataset.theme = localStorage.getItem("margin.review.theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch { /* optional */ }
  if (desktop) { const theme = await desktop.theme(); if (theme) document.documentElement.dataset.theme = theme; }
  await refreshBootstrap();
  let remembered;
  try { remembered = sessionStorage.getItem("margin.review.document"); } catch { /* optional */ }
  const requested = new URL(location.href).searchParams.get("document");
  const requestedAvailable = desktop && requested || state.bootstrap.documents.some((item) => item.path === requested);
  const path = requestedAvailable ? requested : state.bootstrap.documents.some((item) => item.path === remembered) ? remembered : state.bootstrap.initialDocument;
  await loadDocument(path);
  const events = new EventSource("/api/events");
  let connected = false;
  events.onopen = () => { $("#connection").textContent = "● 本地"; if (connected && state.document) $("#external-notice").hidden = false; connected = true; };
  events.onerror = () => { $("#connection").textContent = "○ 已断开"; };
  for (const name of ["review", "document"]) events.addEventListener(name, () => { $("#external-notice").hidden = false; });
}
start().catch((error) => { $("#document-title").textContent = "无法打开文档"; toast(error.message); });
