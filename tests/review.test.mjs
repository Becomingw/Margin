import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, it } from "node:test";
import { createReviewStore, hashText } from "../review-store.mjs";
import { exportReviewPackage, importReviewPackage, unzipFiles, zipFiles } from "../review-package.mjs";
import { parseMarkdown } from "../markdown.mjs";
import { api, apiOk, cleanupAll, getDocument, makeProject, makeTempDir, runSetup, startServer, trySymlink } from "./helpers.mjs";

after(cleanupAll);
const post = (server, route, body) => apiOk(server, `/api/review/${route}`, { method: "POST", body });

it("migrates predecessor state and ZIP identities into Margin without losing review history", async () => {
  const project = await makeProject({ files: { "main.md": "# Migration\n\nKeep this evidence.\n" }, setupArgs: ["--main", "main.md"] });
  let server = await startServer(project.root);
  const before = await apiOk(server, "/api/review?path=main.md");
  const comment = await post(server, "comment", { path: "main.md", etag: before.document.revisions[0].hash, start: 0, end: 0, body: "Preserve the review." });
  await server.stop();
  const state = JSON.parse(await fs.readFile(path.join(project.root, ".margin/review.json"), "utf8"));
  state.format = "paper-pal-review";
  await fs.writeFile(path.join(project.root, ".margin/review.json"), JSON.stringify(state));
  await fs.rename(path.join(project.root, ".margin.json"), path.join(project.root, ".paper-pal.json"));
  await fs.rename(path.join(project.root, ".margin"), path.join(project.root, ".paper-pal"));
  server = await startServer(project.root);
  const migrated = await apiOk(server, "/api/review?path=main.md");
  assert.equal(migrated.document.id, before.document.id);
  assert.equal(migrated.comments[0].id, comment.id);
  const files = unzipFiles(Buffer.from(await (await fetch(`${server.baseUrl}/api/review/export`)).arrayBuffer()));
  assert.equal(JSON.parse(files.get("review/state.json")).format, "margin-review");
  const manifest = JSON.parse(files.get("manifest.json"));
  assert.equal(manifest.format, "margin-review-package");
  // Simulate the old writer, recalculating the hash before rebuilding its ZIP.
  manifest.format = "paper-pal-review-package";
  files.set("review/state.json", Buffer.from(JSON.stringify(state)));
  manifest.files.find((entry) => entry.path === "review/state.json").sha256 = hashText(files.get("review/state.json"));
  files.set("manifest.json", JSON.stringify(manifest));
  const receiver = await startServer((await makeProject()).root);
  const imported = await post(receiver, "import", { package: zipFiles(files).toString("base64") });
  const restored = await apiOk(receiver, `/api/review?path=${imported.documents[0].path}`);
  assert.equal(restored.document.id, before.document.id);
  assert.equal(restored.comments[0].id, comment.id);
  assert.equal(restored.comments[0].body, "Preserve the review.");
  for (const entry of state.events) assert.ok(restored.events.some((event) => event.id === entry.id));
  await post(receiver, "comment", { path: restored.document.path, etag: restored.document.revisions.at(-1).hash, start: 0, end: 0, body: "Continue in Margin." });
  assert.equal((await apiOk(receiver, `/api/review?path=${restored.document.path}`)).comments.length, 2);
});

for (const format of ["md", "tex"]) {
  it(`${format}: comment, reply, edit, delete, restore, checkpoint and package round trip`, async () => {
    const source = format === "md" ? "\uFEFF# 方法\r\n\r\nThe result 😀 is preliminary.\r\n\r\nUnchanged **text**.\r\n" : "\\documentclass{article}\r\n\\begin{document}\r\n\\section{方法}\r\n\r\nThe result 😀 is preliminary.\r\n\r\nUnchanged \\emph{text}.\r\n\\end{document}\r\n";
    const file = `main.${format}`;
    const project = await makeProject({ files: { [file]: source, "refs.bib": "@article{demo, title={Example}}\n" }, setupArgs: ["--main", file] });
    const server = await startServer(project.root);
    let review = await apiOk(server, `/api/review?path=${file}`);
    const base = review.document.revisions[0];
    const start = source.indexOf("result 😀");
    let comment = await post(server, "comment", { path: file, etag: base.hash, start, end: start + "result 😀".length, body: "请检查结论。", heading: "方法" });
    const update = async (action, body) => { comment = await post(server, "comment-update", { id: comment.id, action, body, expectedUpdatedAt: comment.updatedAt || comment.createdAt }); };
    await update("reply", "已检查第一组实验。");
    await update("edit", "请核对全部实验的结论。");
    await update("resolve");
    await update("reopen");
    await update("delete");
    await update("restore");
    review = await post(server, "save", { path: file, etag: base.hash, start: 0, end: 0, text: format === "md" ? "Review note.\n\n" : "% review note\n", reason: "补充说明", commentIds: [comment.id] });
    const shifted = review.comments[0];
    assert.ok(shifted.anchor.start > start);
    assert.equal(review.document.revisions.at(-1).source.slice(shifted.anchor.start, shifted.anchor.end), "result 😀");
    review = await post(server, "save", { path: file, etag: review.document.revisions.at(-1).hash, start: shifted.anchor.start, end: shifted.anchor.end, text: "", reason: "删除待核实词句", commentIds: [comment.id] });
    assert.equal(review.comments[0].anchor.status, "deleted");
    assert.equal(review.comments[0].original.quote, "result 😀");
    review = await post(server, "restore", { path: file, etag: review.document.revisions.at(-1).hash, revisionId: base.id });
    assert.equal(review.document.revisions.at(-1).source, source);
    assert.equal(review.comments[0].anchor.status, "attached");
    assert.ok((await fs.readFile(path.join(project.root, file))).equals(Buffer.from(source)));
    review = await post(server, "checkpoint", { path: file, etag: review.document.revisions.at(-1).hash, label: "第二轮" });
    assert.notEqual(review.document.baselineId, base.id);
    const response = await fetch(`${server.baseUrl}/api/review/export`);
    assert.equal(response.status, 200);
    const archive = Buffer.from(await response.arrayBuffer());
    const entries = unzipFiles(archive);
    assert.match(entries.get("REVIEW.md").toString(), /请核对全部实验的结论/);
    assert.match(entries.get("REVIEW.md").toString(), /删除待核实词句/);
    assert.ok(entries.has("documents/current/refs.bib"));
    const parsed = importReviewPackage(archive);
    assert.equal(parsed.state.comments[0].id, comment.id);
    const fresh = await makeProject();
    const receiver = await startServer(fresh.root);
    const result = await post(receiver, "import", { package: archive.toString("base64") });
    const importedPath = result.documents[0].path;
    let imported = await apiOk(receiver, `/api/review?path=${encodeURIComponent(importedPath)}`);
    assert.equal(imported.document.id, review.document.id);
    assert.deepEqual(imported.document.revisions, review.document.revisions);
    assert.deepEqual(imported.comments, review.comments);
    assert.equal(imported.document.baselineId, review.document.baselineId);
    assert.equal(imported.events.filter((item) => item.documentId).length, review.events.filter((item) => item.documentId).length);
    assert.ok((await fs.readFile(path.join(fresh.root, importedPath))).equals(Buffer.from(source)));
    assert.equal(await fs.readFile(path.join(fresh.root, path.dirname(importedPath), "refs.bib"), "utf8"), "@article{demo, title={Example}}\n");
    imported = await post(receiver, "save", { path: importedPath, etag: imported.document.revisions.at(-1).hash, start: start, end: start + 6, text: "finding", reason: "继续审阅" });
    assert.equal(imported.document.revisions.length, review.document.revisions.length + 1);
    const again = await fetch(`${receiver.baseUrl}/api/review/export`);
    assert.equal(again.status, 200);
    assert.ok(importReviewPackage(Buffer.from(await again.arrayBuffer())).state.comments.some((item) => item.id === comment.id));
    // Same review identity is never silently duplicated in the same project.
    const folders = await fs.readdir(path.join(fresh.root, "imports"));
    assert.equal((await api(receiver, "/api/review/import", { method: "POST", body: { package: archive.toString("base64") } })).status, 409);
    assert.deepEqual(await fs.readdir(path.join(fresh.root, "imports")), folders, "a rejected package must not leave resource-only folders");
  });
}

it("Markdown blocks tile source and preserve source mapping across mixed constructs", async () => {
  const source = "\uFEFF# 标题\r\n\r\nA **bold** word and [link](https://example.org).\r\n\r\n- list\r\n- next\r\n\r\n```js\r\nconst x = '**literal**';\r\n```\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n\r\nLast 😀";
  const blocks = parseMarkdown(source);
  assert.equal(blocks.map((item) => item.raw).join(""), source);
  assert.ok(blocks.some((item) => item.kind === "code" && item.display.includes("**literal**")));
  for (const block of blocks) for (let i = 0; i < block.display.length; i += 1) assert.equal(block.raw.slice(block.displayStarts[i], block.displayEnds[i]).replace(/\r\n?/g, "\n"), block.display[i]);
  const project = await makeProject({ files: { "main.md": source } });
  const server = await startServer(project.root);
  const document = await getDocument(server, "main.md");
  assert.equal(document.format, "markdown");
  const at = source.indexOf("bold");
  await post(server, "save", { path: "main.md", etag: document.etag, start: at, end: at + 4, text: "strong" });
  assert.ok((await fs.readFile(path.join(project.root, "main.md"))).equals(Buffer.from(source.replace("bold", "strong"))));
});

it("external changes are recorded, and repeated text is not guessed as an anchor", async () => {
  const project = await makeProject({ files: { "main.md": "# Note\n\nUnique passage.\n" } });
  const server = await startServer(project.root);
  const review = await apiOk(server, "/api/review?path=main.md");
  await post(server, "comment", { path: "main.md", etag: review.document.revisions[0].hash, start: 8, end: 22, body: "Check this." });
  await fs.writeFile(path.join(project.root, "main.md"), "Unique passage.\n\nUnique passage.\n");
  const changed = await apiOk(server, "/api/review?path=main.md");
  assert.equal(changed.comments[0].anchor.status, "unlocated");
  assert.equal(changed.events.at(-1).type, "external-change");
});

it("rejects tampering, unsupported packages and unsafe import paths before writing", async () => {
  const project = await makeProject();
  const server = await startServer(project.root);
  const archive = Buffer.from(await (await fetch(`${server.baseUrl}/api/review/export`)).arrayBuffer());
  const entries = unzipFiles(archive);
  entries.set("documents/current/main.tex", Buffer.from("tampered"));
  const result = await api(server, "/api/review/import", { method: "POST", body: { package: zipFiles(entries).toString("base64") } });
  assert.equal(result.status, 400);
  for (const unsafe of ["../escape.md", "/absolute.tex", "a\\b.md", ".margin/review.json", "a/../b.md"]) {
    assert.equal((await api(server, "/api/review/import", { method: "POST", body: { files: [{ path: unsafe, content: Buffer.from("text").toString("base64") }] } })).status, 400);
  }
  assert.equal((await fs.readdir(project.root)).includes("imports"), false);
});

it("finishes an interrupted source/metadata save on restart", async () => {
  const root = await makeTempDir();
  let source = "Before 😀";
  let failOnce = false;
  const dependencies = {
    root,
    readSource: async () => source,
    writeSource: async (_path, text) => { source = text; },
    atomicWrite: async (file, text) => { if (failOnce && file.endsWith("review.json")) { failOnce = false; throw new Error("simulated crash"); } await fs.writeFile(file, text); },
    listDocuments: async () => [{ path: "main.md" }],
  };
  const store = createReviewStore(dependencies);
  const original = await store.open("main.md");
  failOnce = true;
  await assert.rejects(store.save({ path: "main.md", etag: hashText(source), text: "After 😀" }), /simulated crash/);
  assert.equal(source, "After 😀");
  const restarted = createReviewStore(dependencies);
  const recovered = await restarted.open("main.md");
  assert.equal(recovered.document.revisions.length, 2);
  assert.equal(recovered.document.revisions[0].id, original.document.revisions[0].id);
  assert.equal(recovered.document.revisions.at(-1).source, source);
  assert.equal(recovered.events.filter((item) => item.type === "edit").length, 1);
  const exported = exportReviewPackage(await restarted.snapshot());
  assert.equal(importReviewPackage(exported).state.documents[0].revisions.length, 2);
});

it("retains more than 50 revisions across restart and rejects concurrent stale saves", async () => {
  const project = await makeProject({ files: { "main.md": "# Initial\n" } });
  let server = await startServer(project.root);
  let review = await apiOk(server, "/api/review?path=main.md");
  const first = review.document.revisions[0];
  for (let i = 0; i < 55; i += 1) review = await post(server, "save", { path: "main.md", etag: review.document.revisions.at(-1).hash, text: `# Revision ${i}\n` });
  const etag = review.document.revisions.at(-1).hash;
  const competing = await Promise.all(["Writer A", "Writer B"].map((text) => api(server, "/api/review/save", { method: "POST", body: { path: "main.md", etag, text } })));
  assert.deepEqual(competing.map((item) => item.status).sort(), [200, 409]);
  await server.stop();
  server = await startServer(project.root);
  review = await apiOk(server, "/api/review?path=main.md");
  assert.equal(review.document.revisions.length, 57);
  review = await post(server, "restore", { path: "main.md", etag: review.document.revisions.at(-1).hash, revisionId: first.id });
  assert.equal(review.document.revisions.length, 58);
  assert.equal(review.document.revisions.at(-1).source, first.source);
});

it("opens either file format directly and asks when both entry names exist", async () => {
  for (const format of ["md", "tex"]) {
    const root = await makeTempDir();
    const file = path.join(root, `draft.${format}`);
    await fs.writeFile(file, format === "md" ? "# Draft\n" : "\\section{Draft}\n");
    const setup = runSetup([file, "--json", "--no-remember", "--no-compile"]);
    assert.equal(setup.status, 0, setup.stdout);
    assert.equal(JSON.parse(setup.stdout).defaultDocument, `draft.${format}`);
  }
  const root = await makeTempDir();
  await fs.writeFile(path.join(root, "main.tex"), "\\section{Draft}\n");
  await fs.writeFile(path.join(root, "main.md"), "# Draft\n");
  const setup = runSetup([root, "--json", "--no-remember"]);
  assert.equal(setup.status, 5);
  assert.deepEqual(JSON.parse(setup.stdout).error.candidates, ["main.md", "main.tex"]);
});

it("rejects overlapping import paths and symlinked import roots before writing", async (t) => {
  const project = await makeProject();
  const server = await startServer(project.root);
  const files = ["image.png", "image.png/sub.md", "note.md"].map((name) => ({ path: name, content: Buffer.from("# Note\n").toString("base64") }));
  assert.equal((await api(server, "/api/review/import", { method: "POST", body: { files } })).status, 400);
  assert.equal((await fs.readdir(project.root)).includes("imports"), false);
  const outside = await makeTempDir();
  if (!await trySymlink(outside, path.join(project.root, "imports"), "dir")) return t.skip("symlinks unavailable");
  const refused = await api(server, "/api/review/import", { method: "POST", body: { files: [files[2]] } });
  assert.equal(refused.status, 403);
  assert.deepEqual(await fs.readdir(outside), []);
});

it("refuses recovery over an external edit and keeps the pending evidence", async () => {
  const root = await makeTempDir();
  let source = "Original";
  let crash = false;
  const dependencies = {
    root, readSource: async () => source, writeSource: async (_name, text) => { source = text; },
    atomicWrite: async (file, text) => { if (crash && file.endsWith("review.json")) throw new Error("interrupted"); await fs.writeFile(file, text); },
    listDocuments: async () => [{ path: "main.md" }],
  };
  const store = createReviewStore(dependencies);
  await store.open("main.md");
  crash = true;
  await assert.rejects(store.save({ path: "main.md", etag: hashText(source), text: "Pending" }), /interrupted/);
  source = "External author edit";
  await assert.rejects(createReviewStore(dependencies).recover(), /changed during an interrupted save/);
  assert.equal(source, "External author edit");
  assert.ok((await fs.readFile(path.join(root, "review-pending.json"), "utf8")).includes("Pending"));
});

it("exports hidden manuscript files and imports resources inside a nested source root", async () => {
  const project = await makeProject({
    files: { "paper/main.tex": "\\input{section}\n", "paper/section.tex": "\\section{Review}\nText.\n", "paper/notes.md": "# Notes\n", "paper/refs.bib": "@article{demo, title={Example}}\n" },
    setupArgs: ["--main", "paper/main.tex", "--source", "paper"],
    config: { ui: { initialDocument: "paper/section.tex", hiddenDocuments: ["paper/main.tex"] } },
  });
  const server = await startServer(project.root);
  assert.equal((await apiOk(server, "/api/bootstrap")).documents.some((item) => item.path === "paper/main.tex"), false);
  const archive = Buffer.from(await (await fetch(`${server.baseUrl}/api/review/export`)).arrayBuffer());
  assert.ok(unzipFiles(archive).has("documents/current/paper/main.tex"));
  const fresh = await makeProject({ files: { "source/main.md": "# Receiver\n" }, setupArgs: ["--main", "source/main.md", "--source", "source"] });
  const receiver = await startServer(fresh.root);
  const imported = await post(receiver, "import", { package: archive.toString("base64") });
  const main = imported.documents.find((item) => item.path.endsWith("paper/main.tex"));
  assert.ok(main.path.startsWith("source/imports/"));
  assert.equal(await fs.readFile(path.join(fresh.root, path.dirname(main.path), "refs.bib"), "utf8"), "@article{demo, title={Example}}\n");
});
