#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { apiOk, cleanupAll, makeProject, startServer } from "../tests/helpers.mjs";

let browser;
try {
  const project = await makeProject({ files: { "first.md": "# First\n\nFirst document.\n", "second.md": "# Second\n\nSecond document.\n" }, setupArgs: ["--main", "first.md"] });
  const token = "fictional-browser-mcp-token";
  const server = await startServer(project.root, { env: { MARGIN_MCP_TOKEN: token } });
  await apiOk(server, "/api/review?path=second.md");
  browser = await chromium.launch();
  const page = await browser.newPage();
  if (process.argv.includes("--baseline")) {
    const baseline = execFileSync("git", ["show", "HEAD:public/app.js"], { encoding: "utf8" });
    await page.route("**/app.js", (route) => route.fulfill({ contentType: "text/javascript", body: baseline }));
  }
  await page.goto(server.baseUrl);
  await page.waitForFunction(() => document.querySelector("#document").dataset.path === "first.md");
  let releaseDocument;
  let releaseOriginal;
  const documentGate = new Promise((resolve) => { releaseDocument = resolve; });
  const originalGate = new Promise((resolve) => { releaseOriginal = resolve; });
  await page.route("**/api/document?path=second.md", async (route) => { await documentGate; await route.continue(); });
  await page.route("**/api/review/render?path=first.md&*", async (route) => { await originalGate; await route.continue(); });
  await page.locator("#document-select").selectOption("second.md");
  const requested = page.waitForRequest((request) => request.url().includes("/api/review/render?path=first.md"));
  await page.locator('[data-view="original"]').click();
  await requested;
  releaseDocument();
  await page.waitForFunction(() => document.querySelector("#document").dataset.path === "second.md");
  const oldResponse = page.waitForResponse((response) => response.url().includes("/api/review/render?path=first.md"));
  releaseOriginal();
  await oldResponse;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.match(await page.locator("#document").innerText(), /Second document/, "a late original-view response must not overwrite the new document");
  await page.locator('[data-view="changes"]').click();
  assert.equal(await page.locator("#outline button").count(), 0, "source diff must not keep stale outline links");
  await page.locator('[data-view="current"]').click();
  const doc = await apiOk(server, "/api/document?path=second.md");
  const proposal = await apiOk(server, "/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "review_suggest", arguments: { path: "second.md", etag: doc.etag, start: doc.source.indexOf("Second document"), end: doc.source.indexOf("Second document") + 6, text: "Revised", body: "Use a more precise description." } } } });
  assert.ok(!proposal.result.isError);
  assert.equal((await apiOk(server, "/api/document?path=second.md")).source, doc.source);
  await page.locator("#reload").click();
  await page.waitForSelector(".suggestion-diff");
  assert.match(await page.locator(".card-meta").first().innerText(), /AI/);
  await page.locator("#comment-search").fill("precise");
  await page.locator("#next-comment").click();
  assert.equal(await page.locator(".review-card.active").count(), 1);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "采纳建议" }).click();
  await page.waitForFunction(() => document.querySelector("#document").textContent.includes("Revised document"));
  await page.locator("#comment-filter").selectOption("resolved");
  assert.match(await page.locator(".suggestion-title").innerText(), /已采纳/);
  await page.locator("#toggle-navigation").click();
  await page.locator("#toggle-review").click();
  assert.equal(await page.locator("#navigation").isVisible(), false);
  assert.equal(await page.locator("#review-pane").isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator("#mcp-connect").click();
  assert.match(await page.locator("#mcp-status").innerText(), /已启用/);
  assert.ok(!(await page.content()).includes(token));
  await page.locator("#mcp-close").click();
  await page.locator("#toggle-navigation").click();
  await page.locator("#toggle-review").click();
  await page.locator("#comment-search").fill("");
  await page.locator("#comment-filter").selectOption("open");
  const current = await apiOk(server, "/api/document?path=second.md");
  await apiOk(server, "/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "review_suggest", arguments: { path: "second.md", etag: current.etag, start: current.source.indexOf("Revised"), end: current.source.indexOf("Revised") + 7, text: "Final", body: "Keep the last round of feedback." } } } });
  await page.locator("#reload").click();
  await page.waitForSelector(".suggestion-diff");
  let releaseAcceptance;
  let committed;
  const acceptanceGate = new Promise((resolve) => { releaseAcceptance = resolve; });
  const committedGate = new Promise((resolve) => { committed = resolve; });
  await page.route("**/api/review/suggestion-resolve", async (route) => {
    const response = await route.fetch();
    committed();
    await acceptanceGate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "采纳建议" }).click();
  await committedGate;
  await page.locator("#document-select").selectOption("first.md");
  await page.waitForFunction(() => document.querySelector("#document").dataset.path === "first.md");
  releaseAcceptance();
  await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("已应用建议"));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator("#document").getAttribute("data-path"), "first.md", "an old mutation response must not navigate away from the author's newly selected document");
  assert.match((await apiOk(server, "/api/document?path=second.md")).source, /Final document/);

  // The source write succeeds, but its follow-up read fails: don't hide that in a closed form.
  await page.locator("#edit-source").click();
  await page.locator("#composer-body").fill("# First\n\nSaved despite the interrupted reload.\n");
  await page.route("**/api/document?path=first.md", (route) => route.abort(), { times: 1 });
  await page.locator("#composer-submit").click();
  await page.waitForFunction(() => !document.querySelector("#composer").open && document.querySelector("#document").getAttribute("aria-busy") === "false");
  assert.match(await page.locator("#toast").innerText(), /已保存.*刷新/);
  assert.match((await apiOk(server, "/api/document?path=first.md")).source, /Saved despite/);
  console.log("Review interaction regressions passed.");
} finally {
  await browser?.close();
  await cleanupAll();
}
