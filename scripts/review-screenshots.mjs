#!/usr/bin/env node
// Browser regression and screenshots use only throwaway fictional manuscripts.
// Install Playwright with --no-save; it is not a runtime dependency.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { apiOk, appRoot, cleanupAll, makeProject, samplePaper, startServer } from "../tests/helpers.mjs";

const argv = process.argv.slice(2);
const out = path.resolve(argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : path.join(appRoot, "docs/images"));
let browser;
try {
  await fs.mkdir(out, { recursive: true });
  const md = "\uFEFF# Dawn chorus review\r\n\r\nStreet lights may influence the start of birdsong. This **preliminary** result needs replication.\r\n\r\n## Evidence\r\n\r\nThe model uses $y = ax + b$ and 48 fictional sites. 中文审阅与 emoji 😀 remain intact.\r\n\r\n- Check seasonal effects.\r\n- Separate light from traffic noise.\r\n";
  const project = await makeProject({ from: samplePaper, files: { "notes.md": md }, config: { ui: { initialDocument: "sections/01_introduction.tex" } } });
  const server = await startServer(project.root);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const foreign = [];
  page.on("request", (request) => { if (!request.url().startsWith(server.baseUrl) && !request.url().startsWith("blob:")) foreign.push(request.url()); });
  await page.goto(server.baseUrl);
  await page.waitForSelector(".block-content");
  const save = async () => {
    await page.locator("#composer-submit").click();
    await page.waitForFunction(() => !document.querySelector("#composer").open);
    await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("已保存"));
  };
  for (const [format, filename] of [["latex", "sections/01_introduction.tex"], ["markdown", "notes.md"]]) {
    console.log(`Checking ${format}`);
    if (await page.locator("#document-select").inputValue() !== filename) await page.locator("#document-select").selectOption(filename);
    await page.waitForFunction((name) => document.querySelector("#document").dataset.path === name, filename);
    await page.waitForFunction((name) => document.querySelector("#document-title").textContent === name, path.basename(filename));
    await page.waitForFunction(() => document.querySelector("#document").textContent.includes("Street lights"));
    // Select actual DOM text, exercising the same source mapping as pointer selection.
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.querySelector("#document"), NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const at = walker.currentNode.textContent.indexOf("Street lights");
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(walker.currentNode, at);
        range.setEnd(walker.currentNode, at + "Street lights".length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.querySelector("#document").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        return;
      }
      throw new Error("Selection text is missing");
    });
    await page.waitForFunction(() => !document.querySelector("#selection-actions").hidden, null, { timeout: 3000 }).catch(async (error) => {
      console.error(await page.evaluate(() => ({ title: document.querySelector("#document-title").textContent, view: document.querySelector('[data-view][aria-pressed="true"]').dataset.view, selection: window.getSelection().toString(), html: document.querySelector("#document").innerHTML.slice(0, 3000) })));
      throw error;
    });
    await page.locator("#selection-comment").click();
    assert.equal(await page.locator("#composer-quote").textContent(), "Street lights");
    await page.locator("#composer-body").fill("请说明光照与交通噪声如何分离，并核对季节效应。\nCheck the evidence before strengthening this claim.");
    await save();
    await page.waitForFunction(() => document.querySelector("#comment-count").textContent === "1");
    await page.locator(".review-card").getByRole("button", { name: "回复", exact: true }).click();
    await page.locator("#composer-body").fill("已核对方法；结论改为更谨慎的表述。");
    await save();
    await page.locator("#edit-source").click();
    const source = await page.locator("#composer-body").inputValue();
    await page.locator("#composer-body").fill(source.replace("Street lights", "Artificial lighting"));
    await page.locator("#composer-reason").fill("术语更准确；保留待复核的因果解释。");
    const commentId = (await apiOk(server, `/api/review?path=${filename}`)).comments[0].id;
    await page.locator("#composer-linked").selectOption(commentId);
    await save();
    await page.waitForFunction(() => document.querySelector("#document").textContent.includes("Artificial lighting"));
    const review = await apiOk(server, `/api/review?path=${filename}`);
    assert.equal(review.comments[0].anchor.status, "modified");
    assert.equal(review.comments[0].replies.length, 1);
    if (format === "markdown") assert.equal(await fs.readFile(path.join(project.root, filename), "utf8"), md.replace("Street lights", "Artificial lighting"));
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.querySelector("#toast").hidden = true; }, theme);
      await page.screenshot({ path: path.join(out, `review-${format}-${theme}.png`) });
    }
    await page.locator('[data-view="changes"]').click();
    await page.waitForSelector("#document del");
    const inserted = (await page.locator("#document ins").allTextContents()).join(" ");
    assert.ok(inserted.includes("Artificial") && inserted.includes("lighting"));
    assert.equal(await page.locator(".source-diff").evaluate((element) => { const copy = element.cloneNode(true); copy.querySelectorAll("del").forEach((item) => item.remove()); return copy.textContent; }), review.document.revisions.at(-1).source);
    await page.locator('[data-tab="changes"]').click();
    await page.screenshot({ path: path.join(out, `review-${format}-changes.png`) });
    await page.locator('[data-view="original"]').click();
    await page.waitForFunction(() => document.querySelector("#document").textContent.includes("Street lights"));
    await page.locator('[data-view="current"]').click();
    await page.locator('[data-tab="comments"]').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".review-pane").scrollIntoViewIfNeeded();
  assert.ok(await page.locator(".review-pane").isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "mobile layout must not overflow horizontally");
  await page.screenshot({ path: path.join(out, "review-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const downloading = page.waitForEvent("download");
  await page.locator("#export-package").click();
  const download = await downloading;
  const zip = await download.path();
  const receiverProject = await makeProject({ config: { ui: { initialDocument: "sections/01_introduction.tex" } } });
  const receiver = await startServer(receiverProject.root);
  const receiving = await browser.newPage();
  await receiving.goto(receiver.baseUrl);
  await receiving.waitForSelector(".block-content");
  await receiving.locator("#package-input").setInputFiles(zip);
  await receiving.waitForFunction(() => document.querySelector("#toast").textContent.includes("审阅包已恢复"));
  const restored = await apiOk(receiver, "/api/bootstrap");
  const importedPath = restored.documents.find((item) => item.path.startsWith("imports/") && item.path.endsWith("notes.md")).path;
  await receiving.locator("#document-select").selectOption(importedPath);
  await receiving.waitForFunction(() => document.querySelector("#comment-count").textContent === "1");
  assert.equal((await apiOk(receiver, `/api/review?path=${importedPath}`)).comments[0].replies.length, 1);
  await receiving.locator("#document-comment").click();
  await receiving.locator("#composer-body").fill("导入后的第二轮审阅。");
  await receiving.locator("#composer-submit").click();
  await receiving.waitForFunction(() => document.querySelector("#comment-count").textContent === "2");
  assert.deepEqual(errors, [], "browser must not log errors");
  assert.deepEqual(foreign, [], "the page must not make third-party requests");
  console.log("Browser review passed: both formats, source mapping, comments, replies, CRLF, diff/original, mobile, ZIP export/import and continued editing.");
  console.log(`Screenshots: ${path.relative(appRoot, out)}`);
} finally {
  await browser?.close();
  await cleanupAll();
}
