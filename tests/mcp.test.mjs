import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, it } from "node:test";
import { api, apiOk, appRoot, cleanupAll, makeProject, rawRequest, startServer, testEnvironment } from "./helpers.mjs";
import { importReviewPackage, exportReviewPackage } from "../review-package.mjs";

after(cleanupAll);
const token = "fictional-mcp-test-token";
const headers = { Authorization: `Bearer ${token}` };
const rpc = (server, method, params = {}, extra = {}) => apiOk(server, "/mcp", { method: "POST", headers: { ...headers, ...extra }, body: { jsonrpc: "2.0", id: 1, method, params } });
const call = async (server, name, args) => (await rpc(server, "tools/call", { name, arguments: args })).result;
const value = async (server, name, args) => {
  const result = await call(server, name, args);
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent;
};

it("MCP reviews both formats without writing source; explicit acceptance is atomic, attributed, portable and restorable", async () => {
  for (const filename of ["notes.md", "main.tex"]) {
    const source = `\uFEFF${filename.endsWith("md") ? "# Evidence" : "\\section{Evidence}"}\r\n\r\nA strong claim 😀.\r\n`;
    const project = await makeProject({ files: { [filename]: source }, setupArgs: ["--main", filename] });
    const server = await startServer(project.root, { env: { MARGIN_MCP_TOKEN: token } });
    const init = await rpc(server, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(init.result.protocolVersion, "2025-06-18");
    const tools = (await rpc(server, "tools/list")).result.tools;
    assert.equal(tools.length, 7);
    assert.ok(tools.every((tool) => tool.inputSchema.type === "object" && !tool.outputSchema));
    assert.equal((await value(server, "document_list", {})).items.some((item) => item.path === filename), true);
    const original = await value(server, "document_read", { path: filename });
    assert.equal(original.source, source);
    assert.equal((await call(server, "review_suggest", { path: filename, etag: original.etag, start: 0, end: 1, body: "Invalid BOM removal", text: "" })).isError, true);
    const splitPair = source.indexOf("😀") + 1;
    assert.equal((await call(server, "review_suggest", { path: filename, etag: original.etag, start: splitPair, end: splitPair, body: "Invalid split", text: "x" })).isError, true);
    let joined = "";
    let offset = 0;
    do {
      const part = await value(server, "document_read", { path: filename, offset, limit: 7, etag: original.etag });
      assert.ok(part.source.isWellFormed());
      joined += part.source;
      offset = part.nextOffset;
    } while (offset !== null);
    assert.equal(joined, source);
    const comment = await value(server, "review_comment", { path: filename, etag: original.etag, start: 0, end: 0, body: "Please verify the evidence." });
    const reply = await value(server, "review_reply", { id: comment.id, expectedUpdatedAt: comment.createdAt, body: "A smaller claim fits the evidence." });
    assert.equal(reply.replies[0].actor, "agent");
    assert.equal((await call(server, "review_reply", { id: comment.id, expectedUpdatedAt: comment.createdAt, body: "stale" })).isError, true);
    const start = source.indexOf("strong");
    const proposal = await value(server, "review_suggest", { path: filename, etag: original.etag, start, end: start + 6, body: "Avoid overstating causality.", text: "careful\nqualified" });
    assert.equal(proposal.actor, "agent");
    assert.equal(proposal.suggestion.text, "careful\r\nqualified");
    assert.equal(await fs.readFile(path.join(project.root, filename), "utf8"), source);
    assert.equal((await value(server, "document_read", { path: filename })).baselineId, original.baselineId);
    assert.ok((await rpc(server, "tools/call", { name: "review_save", arguments: {} })).error);
    assert.ok((await rpc(server, "tools/call", { name: "review_comment", arguments: { path: filename, etag: original.etag, start: 0, end: 0, body: "fake", actor: "author" } })).error);
    const resolved = await apiOk(server, "/api/review/suggestion-resolve", { method: "POST", body: { id: proposal.id, expectedUpdatedAt: proposal.createdAt, etag: original.etag, action: "accept" } });
    assert.equal(await fs.readFile(path.join(project.root, filename), "utf8"), source.replace("strong", "careful\r\nqualified"));
    assert.equal(resolved.document.baselineId, original.baselineId);
    assert.equal(resolved.events.find((event) => event.resultRevision).actor, "author");
    assert.equal(resolved.comments.find((item) => item.id === proposal.id).suggestion.status, "accepted");
    assert.equal((await api(server, "/api/review/suggestion-resolve", { method: "POST", body: { id: proposal.id, expectedUpdatedAt: proposal.createdAt, etag: original.etag, action: "accept" } })).status, 409);
    const archive = await fetch(`${server.baseUrl}/api/review/export`);
    const imported = importReviewPackage(Buffer.from(await archive.arrayBuffer()));
    // Re-export checks the full restored graph, including historical snapshots.
    assert.ok(exportReviewPackage(imported.state, imported.assets).length > 0);
    const restored = await apiOk(server, "/api/review/restore", { method: "POST", body: { path: filename, etag: resolved.document.revisions.at(-1).hash, revisionId: original.revisionId } });
    assert.equal(restored.document.revisions.at(-1).source, source);
    assert.ok((await value(server, "review_history", { path: filename, limit: 1 })).nextOffset);
    await server.stop();
  }
});

it("stale suggestions fail closed, rejecting never writes source, and MCP preserves request guards", async () => {
  const project = await makeProject({ files: { "notes.md": "# Test\n\nOld claim.\n" }, setupArgs: ["--main", "notes.md"] });
  const server = await startServer(project.root, { env: { MARGIN_MCP_TOKEN: token } });
  const doc = await value(server, "document_read", { path: "notes.md" });
  const suggestion = await value(server, "review_suggest", { path: "notes.md", etag: doc.etag, start: 9, end: 12, text: "New", body: "Replace claim." });
  await fs.appendFile(path.join(project.root, "notes.md"), "External addition.\n");
  const updated = await value(server, "document_read", { path: "notes.md" });
  assert.equal((await api(server, "/api/review/suggestion-resolve", { method: "POST", body: { id: suggestion.id, expectedUpdatedAt: suggestion.createdAt, etag: updated.etag, action: "accept" } })).status, 409);
  await apiOk(server, "/api/review/suggestion-resolve", { method: "POST", body: { id: suggestion.id, expectedUpdatedAt: suggestion.createdAt, action: "reject" } });
  assert.equal(await fs.readFile(path.join(project.root, "notes.md"), "utf8"), updated.source);
  assert.equal((await call(server, "document_read", { path: "../outside.md" })).isError, true);
  assert.equal((await api(server, "/mcp", { method: "POST", body: {} })).status, 403);
  assert.equal((await api(server, "/mcp", { method: "POST", headers: { ...headers, "MCP-Protocol-Version": "unknown" }, body: {} })).status, 400);
  const malformed = await rawRequest(server, { method: "POST", path: "/mcp", headers: { Host: `127.0.0.1:${server.port}`, "X-Margin": "1", "Content-Type": "application/json", ...headers }, body: "{" });
  assert.equal(JSON.parse(malformed.body).error.code, -32700);
  assert.equal((await api(server, "/mcp", { method: "POST", headers: { ...headers, Origin: "https://foreign.example" }, body: {} })).status, 403);
  assert.equal((await rawRequest(server, { method: "POST", path: "/mcp", headers: { Host: "foreign.example", "X-Margin": "1", ...headers } })).status, 421);
  assert.equal((await rawRequest(server, { method: "POST", path: "/mcp", headers: { Host: `127.0.0.1:${server.port}`, "X-Margin": "1", ...headers } })).status, 415);
  const replies = await Promise.all(Array.from({ length: 10 }, (_, index) => value(server, "review_comment", { path: "notes.md", etag: updated.etag, start: 0, end: 0, body: `Concurrent review ${index}` })));
  const saved = await value(server, "review_comments", { path: "notes.md" });
  assert.ok(replies.every((reply) => saved.items.some((item) => item.id === reply.id)), "serialized metadata updates cannot lose concurrent feedback");
  const notification = await api(server, "/mcp", { method: "POST", headers, body: { jsonrpc: "2.0", method: "notifications/initialized" } });
  assert.equal(notification.status, 202);
});

it("MCP is opt-in, desktop credentials are scoped, and the stdio bridge interoperates", async () => {
  const project = await makeProject({ files: { "notes.md": "# Test\n" }, setupArgs: ["--main", "notes.md"] });
  const disabled = await startServer(project.root);
  assert.equal((await api(disabled, "/mcp", { method: "POST", headers })).status, 404);
  await disabled.stop();
  const server = await startServer(project.root, { env: { MARGIN_DESKTOP_TOKEN: "private-desktop-test", MARGIN_MCP_TOKEN: token } });
  const scoped = { "X-Margin-Desktop-Token": token };
  assert.equal((await rpc(server, "tools/list", {}, scoped)).result.tools.length, 7);
  assert.equal((await api(server, "/api/health", { headers: scoped })).status, 403);
  assert.equal((await api(server, "/api/review/save", { method: "POST", headers: scoped, body: {} })).status, 403);
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(appRoot, "bin/margin-mcp.mjs")], { env: { ...process.env, ...testEnvironment, MARGIN_MCP_URL: `${server.baseUrl}/mcp`, MARGIN_MCP_TOKEN: token }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("exit", (code) => { if (code) reject(new Error(stderr)); else resolve(stdout); });
    child.stdin.end('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
  });
  const messages = output.trim().split("\n").map(JSON.parse);
  assert.deepEqual(messages.map((message) => message.id), [1, 2]);
  assert.equal(messages[1].result.tools.length, 7);
  assert.ok(!output.includes(token));
});
