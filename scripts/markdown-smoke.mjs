#!/usr/bin/env node
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { apiOk, appRoot, cleanupAll, makeProject, startServer } from "../tests/helpers.mjs";

let browser;
try {
  const original = "\uFEFF" + (await fs.readFile(path.join(appRoot, "tests/fixtures/markdown/guide.md"), "utf8")).replace(/\n/g, "\r\n");
  let expected = original;
  const hostile = '\n\n<div onclick="window.untrusted=true"><script>window.untrusted=true</script><iframe src="https://evil.example/"></iframe><img src="https://evil.example/x" onerror="window.untrusted=true"><a href="javascript:alert(1)">Blocked link</a><style>body{display:none}</style><svg onload="window.untrusted=true"></svg></div>\n';
  const project = await makeProject({ files: {
    "notes/guide.md": original,
    "notes/math.md": await fs.readFile(path.join(appRoot, "tests/fixtures/markdown/math.md"), "utf8"),
    "notes/hostile.md": hostile,
    "notes/other.md": "# 关联文档\n\n可以继续审阅。\n",
    "notes/figure.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" rx="8" fill="#eeebf7"/><text x="30" y="65" fill="#6458b5" font-size="24">Fictional evidence</text></svg>',
  }, setupArgs: ["--main", "notes/guide.md"] });
  const server = await startServer(project.root);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const errors = [];
  const foreign = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", (request) => { if (!request.url().startsWith(server.baseUrl)) foreign.push(request.url()); });
  await page.goto(`${server.baseUrl}/?document=notes%2Fguide.md`);
  await page.waitForSelector(".markdown-content table");
  assert.equal(await page.locator(".markdown-content table").count(), 2);
  assert.equal(await page.locator(".markdown-content input[type=checkbox]").count(), 2);
  assert.equal(await page.locator(".markdown-content input:checked").count(), 1);
  assert.equal(await page.locator(".markdown-content mjx-container").count(), 3);
  assert.equal(await page.locator(".markdown-content .md-math-error").count(), 0);
  assert.ok(await page.locator(".markdown-content ul ul").count());
  assert.equal(await page.locator(".markdown-content table").first().locator("th").last().evaluate((el) => getComputedStyle(el).textAlign), "right");
  await page.locator(".md-image img").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector(".md-image img")?.naturalWidth === 400);
  assert.ok(await page.locator(".md-image-placeholder").textContent());
  assert.equal(await page.locator('a[href="https://example.org/guide"]').count(), 1);
  assert.ok(await page.locator('a[href="https://example.org/review"]').count());
  assert.equal(await page.locator(".markdown-content pre").count(), 3);
  await page.locator('a[href="#md-fn-evidence"]').first().click();
  assert.ok(await page.locator("#md-fn-evidence").isVisible());

  async function select(selector, text) {
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    await page.evaluate(({ selector, text }) => {
      const root = document.querySelector(selector);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const at = walker.currentNode.textContent.indexOf(text);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(walker.currentNode, at); range.setEnd(walker.currentNode, at + text.length);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.querySelector("#document").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        return;
      }
      throw new Error(`Missing selection ${text}`);
    }, { selector, text });
    await page.waitForFunction(() => !document.querySelector("#selection-actions").hidden);
  }
  async function submit() {
    await page.locator("#composer-submit").click();
    await page.waitForFunction(() => !document.querySelector("#composer").open);
    // The previous save's toast may still be visible while the next document
    // load replaces the DOM. Wait for this submission's final UI state first.
    await page.waitForFunction(() => !document.querySelector("#composer-submit").disabled);
    await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("已保存"));
  }
  // Selection actions follow the live selection, including keyboard and native
  // selection changes that do not dispatch pointerup on the document.
  await select(".markdown-content table td strong", "需要复核");
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.waitForFunction(() => document.querySelector("#selection-actions").hidden);
  await select(".markdown-content table td strong", "需要复核");
  await page.evaluate(() => window.getSelection().collapseToEnd());
  await page.waitForFunction(() => document.querySelector("#selection-actions").hidden);
  await select(".markdown-content table td strong", "需要复核");
  await page.locator(".markdown-content h1").click();
  await page.waitForFunction(() => document.querySelector("#selection-actions").hidden);
  await select(".markdown-content table td strong", "需要复核");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#selection-actions").hidden);
  await select(".markdown-content table td strong", "需要复核");
  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#project-title"));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.waitForFunction(() => document.querySelector("#selection-actions").hidden);
  for (const [selector, text, raw, next] of [
    [".markdown-content table td strong", "需要复核", "需要复核", "已复核"],
    [".markdown-content table td code", "a|b", "a\\|b", "c\\|d"],
    [".markdown-content table tbody tr:nth-child(3) td:nth-child(2)", "&", "&amp;", "和"],
    [".markdown-content details table strong", "可继续批注", "可继续批注", "准确定位"],
  ]) {
    await select(selector, text);
    await page.locator("#selection-replace").click();
    assert.equal(await page.locator("#composer-body").inputValue(), raw);
    await page.locator("#composer-body").fill(next);
    await page.locator("#composer-reason").fill("验证精确源码范围");
    await submit();
    expected = expected.replace(raw, next);
    assert.deepEqual(await fs.readFile(path.join(project.root, "notes/guide.md")), Buffer.from(expected));
  }
  await select(".markdown-content table td strong", "已复核");
  await page.locator("#selection-comment").click();
  assert.equal(await page.locator("#composer-quote").textContent(), "已复核");
  await page.locator("#composer-body").fill("此单元格的证据已核对，保留审阅记录。");
  await submit();
  await page.waitForSelector(".markdown-content table strong .marked");
  const review = await apiOk(server, "/api/review?path=notes/guide.md");
  assert.equal(expected.slice(review.comments[0].anchor.start, review.comments[0].anchor.end), "已复核");
  await page.locator('[data-view="original"]').click();
  await page.waitForFunction(() => document.querySelector("#document").textContent.includes("需要复核"));
  assert.equal(await page.locator(".markdown-content table").count(), 2);
  await page.locator('[data-view="current"]').click();
  await page.waitForSelector(".markdown-content table strong .marked");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.querySelector(".document-pane").scrollTop = 0; document.querySelector("#toast").hidden = true; }, theme);
    await page.screenshot({ path: path.join(appRoot, `docs/images/markdown-rich-${theme}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "rich Markdown must fit narrow screens");
  await page.screenshot({ path: path.join(appRoot, "docs/images/markdown-rich-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('a[href="other.md"]').click();
  await page.waitForFunction(() => document.querySelector("#document").dataset.path === "notes/other.md");
  await page.locator("#document-select").selectOption("notes/math.md");
  await page.waitForFunction(() => document.querySelector("#document").dataset.path === "notes/math.md");
  assert.equal(await page.locator(".md-math").count(), 15);
  assert.equal(await page.locator(".md-math mjx-container").count(), 14);
  assert.equal(await page.locator(".md-math-error").count(), 1);
  assert.equal(await page.locator(".markdown-content table").first().locator("tbody td").count(), 12);
  assert.equal(await page.locator(".markdown-content table").nth(1).locator("tbody td").count(), 6);
  assert.deepEqual(await page.locator(".markdown-content table").nth(1).locator(".md-math").evaluateAll((items) => items.map((el) => el.getAttribute("aria-label"))), ["P(A|B)", "|x|", "\\|v\\|"]);
  // Formula SVG is selected atomically, so a replacement includes delimiters.
  await page.locator('.md-math[aria-label="D_f"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector('.md-math[aria-label="D_f"]'));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.waitForFunction(() => !document.querySelector("#selection-actions").hidden);
  await page.locator("#selection-replace").click();
  assert.equal(await page.locator("#composer-body").inputValue(), "$D_f$");
  await page.locator("#composer-body").fill("$D_g$");
  await submit();
  assert.equal(await page.locator('.md-math[aria-label="D_g"] mjx-container').count(), 1);
  await page.locator('[data-view="original"]').click();
  await page.waitForSelector('.md-math[aria-label="D_f"] mjx-container');
  await page.locator('[data-view="current"]').click();
  await page.waitForSelector('.md-math[aria-label="D_g"] mjx-container');
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.querySelector(".document-pane").scrollTop = 0; document.querySelector("#toast").hidden = true; }, theme);
    await page.screenshot({ path: path.join(appRoot, `docs/images/markdown-math-${theme}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(appRoot, "docs/images/markdown-math-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#document-select").selectOption("notes/hostile.md");
  await page.waitForFunction(() => document.querySelector("#document").dataset.path === "notes/hostile.md");
  assert.equal(await page.evaluate(() => window.untrusted), undefined);
  assert.equal(await page.locator("#document script, #document iframe, #document style, #document svg, #document [onclick], #document [onerror]").count(), 0);
  assert.equal(await page.locator('#document a[href^="javascript:"]').count(), 0);
  assert.deepEqual(foreign, []);
  assert.deepEqual(errors, []);

  const archive = Buffer.from(await (await fetch(`${server.baseUrl}/api/review/export`)).arrayBuffer());
  const receiver = await startServer((await makeProject()).root);
  const imported = await apiOk(receiver, "/api/review/import", { method: "POST", body: { package: archive.toString("base64") } });
  const filename = imported.documents.find((item) => item.path.endsWith("notes/guide.md")).path;
  await page.goto(`${receiver.baseUrl}/?document=${encodeURIComponent(filename)}`);
  await page.waitForSelector(".markdown-content table strong .marked");
  await page.locator(".md-image img").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector(".md-image img")?.naturalWidth === 400);
  assert.equal((await apiOk(receiver, `/api/review?path=${encodeURIComponent(filename)}`)).comments[0].id, review.comments[0].id);
  console.log("Rich Markdown passed: structured rendering, precise table/HTML/entity edits, comments, original view, local navigation, mobile, safe HTML and package image restoration.");
} finally {
  await browser?.close();
  await cleanupAll();
}
