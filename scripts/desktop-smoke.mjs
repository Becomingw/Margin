#!/usr/bin/env node
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { _electron as electron } from "playwright";
import { appRoot, cleanupAll, makeTempDir } from "../tests/helpers.mjs";

let instance;
const root = await makeTempDir("margin-desktop-");
const project = path.join(root, "中文 manuscript");
await fs.mkdir(project);
const source = "\uFEFF# Desktop review\r\n\r\nA cautious claim 😀.\r\n";
const filename = path.join(project, "notes.md");
const archive = path.join(root, "handoff.marginreview");
await fs.writeFile(filename, source);
const env = { ...process.env, MARGIN_DESKTOP_DATA_DIR: path.join(root, "app-data"), MARGIN_ENV_FILE: "none" };
delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ ...(process.env.MARGIN_DESKTOP_EXECUTABLE ? { executablePath: process.env.MARGIN_DESKTOP_EXECUTABLE, args: [] } : { args: [appRoot] }), env, timeout: 30000 });
try {
  instance = await launch();
  const page = await instance.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForURL("margin://app/");
  await page.waitForSelector("#open-file");
  await instance.evaluate(({ shell, dialog }) => {
    shell.openExternal = async (url) => { globalThis.marginOpenedLink = url; };
    // Expected validation failures show native dialogs; acknowledge them without
    // human interaction before exercising rejected protocols on CI.
    globalThis.marginLinkErrors = [];
    dialog.showMessageBox = async (_window, options) => { globalThis.marginLinkErrors.push(options.detail); return { response: 0 }; };
  });
  await page.evaluate(() => window.marginDesktop.openLink("https://example.org/review"));
  assert.equal(await instance.evaluate(() => globalThis.marginOpenedLink), "https://example.org/review");
  for (const url of ["file:///private/file", "javascript:alert(1)", "data:text/html,test", "https://example.org/\nfile"]) {
    assert.equal(await page.evaluate(async (value) => { try { await window.marginDesktop.openLink(value); return false; } catch { return true; } }, url), true);
  }
  assert.equal(await instance.evaluate(() => globalThis.marginOpenedLink), "https://example.org/review", "unsafe schemes never reach the native shell");
  assert.equal(await instance.evaluate(() => globalThis.marginLinkErrors.length), 4);
  await page.evaluate(() => window.marginDesktop.theme("dark"));
  assert.equal(await page.evaluate(() => typeof require), "undefined");
  assert.equal(await page.evaluate(() => typeof process), "undefined");
  const security = await instance.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
  });
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  await instance.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    dialog.showMessageBox = async (_window, options) => { throw new Error(options.detail || options.message); };
  }, filename);
  await page.locator("#open-file").click();
  await page.waitForSelector(".block-content");
  assert.equal(await page.getAttribute("html", "data-theme"), "dark", "native appearance crosses workspace origins");
  await page.locator("#theme").click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await page.waitForFunction(() => document.querySelector("#document").dataset.path === "notes.md");
  const origin = new URL(page.url()).origin;
  assert.equal((await fetch(`${origin}/api/health`)).status, 403, "private backend requires the main-process token");
  assert.ok(!(await page.content()).includes(root));
  await page.locator("#document-comment").click();
  await page.locator("#composer-body").fill("Desktop comment: verify the evidence.");
  await page.locator("#composer-submit").click();
  await page.waitForFunction(() => document.querySelector("#comment-count").textContent === "1");
  await page.locator("#edit-source").click();
  await page.locator("#composer-body").fill(source.replace("cautious", "careful"));
  await instance.evaluate(({ Menu }) => { Menu.getApplicationMenu().items.find((item) => item.label === "文件").submenu.items.find((item) => item.label === "保存当前编辑").click(); });
  await page.waitForFunction(() => !document.querySelector("#composer").open && document.querySelector("#document").textContent.includes("careful"));
  assert.equal(await fs.readFile(filename, "utf8"), source.replace("cautious", "careful"));
  // Dirty navigation must stay on the current document when the author cancels.
  await page.locator("#edit-source").click();
  await page.locator("#composer-body").fill("Unsaved draft");
  await instance.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
  await page.evaluate(() => window.marginDesktop.home());
  assert.equal(new URL(page.url()).origin, origin);
  assert.equal(await page.locator("#composer-body").inputValue(), "Unsaved draft");
  await page.locator("#composer-cancel").click();
  await instance.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, archive);
  await page.locator("#export-package").click();
  await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("handoff.marginreview"));
  assert.ok((await fs.stat(archive)).size > 100);
  await instance.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, archive);
  await page.locator("#import-package").click();
  await page.waitForFunction(() => document.querySelector("#document")?.dataset.path === "manuscript/notes.md");
  assert.equal(await page.locator("#comment-count").textContent(), "1");
  await page.locator("#document-comment").click();
  await page.locator("#composer-body").fill("Continue after desktop import.");
  await page.locator("#composer-submit").click();
  await page.waitForFunction(() => document.querySelector("#comment-count").textContent === "2");
  await fs.mkdir(path.join(appRoot, "docs/images"), { recursive: true });
  await page.screenshot({ path: path.join(appRoot, "docs/images/desktop-review.png") });
  const importedOrigin = new URL(page.url()).origin;
  await page.locator("#desktop-home").click();
  await page.waitForURL("margin://app/");
  await page.waitForFunction(() => document.querySelectorAll("#recents button").length === 2);
  await page.screenshot({ path: path.join(appRoot, "docs/images/desktop-home.png") });
  assert.equal(await page.getAttribute("html", "data-theme"), "light");
  await page.locator("#home-theme").click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await page.screenshot({ path: path.join(appRoot, "docs/images/desktop-home-dark.png"), animations: "disabled" });
  assert.deepEqual(errors, []);
  await instance.close();
  instance = null;
  await assert.rejects(fetch(`${origin}/api/health`));
  await assert.rejects(fetch(`${importedOrigin}/api/health`));
  // Restart reads the native recent list, then recovers the exact review state.
  instance = await launch();
  const reopened = await instance.firstWindow();
  await reopened.waitForSelector("#recents button");
  await reopened.locator("#recents button").first().click();
  await reopened.waitForFunction(() => document.querySelector("#comment-count")?.textContent === "2");
  assert.equal(await reopened.getAttribute("html", "data-theme"), "dark", "native appearance survives restart");
  assert.ok((await reopened.locator("#document").textContent()).includes("careful"));
  // Open a second format directly, including a file hidden from the default list.
  const tex = path.join(project, "appendix.tex");
  await fs.writeFile(tex, "\\section{Desktop appendix}\n\nA reproducible result.\n");
  const configPath = path.join(project, ".margin.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.ui.hiddenDocuments = ["appendix.tex"];
  await fs.writeFile(configPath, JSON.stringify(config));
  await instance.evaluate(({ dialog, Menu }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    Menu.getApplicationMenu().items.find((item) => item.label === "文件").submenu.items.find((item) => item.label === "打开文档…").click();
  }, tex);
  await reopened.waitForFunction(() => document.querySelector("#document")?.dataset.path === "appendix.tex");
  assert.ok((await reopened.locator("#document-info").textContent()).includes("LaTeX"));
  assert.equal(await reopened.locator("#document-select").inputValue(), "appendix.tex");
  await reopened.locator("#document-comment").click();
  await reopened.locator("#composer-body").fill("LaTeX review uses the same history.");
  await reopened.locator("#composer-submit").click();
  await reopened.waitForFunction(() => document.querySelector("#comment-count").textContent === "1");
  // Backend failures must still allow returning home through the preload bridge.
  await instance.evaluate(({ app, dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0 });
    const service = app.getAppMetrics().find((item) => item.name === "Margin review service");
    if (!service) throw new Error("Review utility process was not found.");
    process.kill(service.pid);
  });
  await reopened.waitForFunction(() => document.querySelector("#connection").textContent.includes("已断开"));
  await reopened.locator("#desktop-home").click();
  await reopened.waitForURL("margin://app/");
  console.log("Desktop smoke passed: sandbox, native open, token protection, save menu, dirty navigation, export/import, persistence, recent projects and backend cleanup.");
} finally {
  await instance?.close();
  await cleanupAll();
}
