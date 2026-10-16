import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, utilityProcess } from "electron";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfigPath } from "../names.mjs";
import { atomicFile, createWorkspace, desktopEnvironment, exists, findProject, prepareProject, rememberProject, restoreWorkspace } from "./workspaces.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.dirname(directory);
const HOME = "margin://app/";
app.setName("Margin");
protocol.registerSchemesAsPrivileged([{ scheme: "margin", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
if (process.env.MARGIN_DESKTOP_DATA_DIR) app.setPath("userData", path.resolve(process.env.MARGIN_DESKTOP_DATA_DIR));
const services = new Set();
let window;
let current;
let recents = [];
let recentFile;
let managedRoot;
let appearance = null;
let quitting = false;
let sequence = Promise.resolve();
const pendingPaths = [];
const enqueue = (task) => { const result = sequence.then(task); sequence = result.catch(() => {}); return result; };
const showError = (error) => error.message === "navigation-cancelled" ? undefined : dialog.showMessageBox(window, { type: "error", title: "Margin", message: "操作未完成", detail: error.message || "请重新打开工作区。" });
const commandPath = (argv) => argv.slice(app.isPackaged ? 1 : 2).find((value) => !value.startsWith("-") && /\.(md|tex|zip|marginreview|ppreview)$/i.test(value));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("open-file", (event, filename) => {
    event.preventDefault();
    if (!window) pendingPaths.push(filename);
    else void enqueue(() => openPath(filename)).catch(showError);
  });
  app.on("second-instance", (_event, argv) => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
    const filename = commandPath(argv);
    if (filename) void enqueue(() => openPath(filename)).catch(showError);
  });
  // Do not await app readiness at ESM top level: Electron waits for the entry
  // module to finish evaluating before it emits ready.
  void app.whenReady().then(startDesktop).catch((error) => { dialog.showErrorBox("Margin 启动失败", error.message); app.exit(1); });
}

async function startDesktop() {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  recentFile = path.join(app.getPath("userData"), "recent-projects.json");
  managedRoot = path.join(app.getPath("userData"), "workspaces");
  try {
    const stored = JSON.parse(await fs.readFile(path.join(app.getPath("userData"), "appearance.json"), "utf8"));
    if (["light", "dark"].includes(stored.theme)) appearance = stored.theme;
  } catch { /* System appearance is the default for a new profile. */ }
  try { const stored = JSON.parse(await fs.readFile(recentFile, "utf8")); if (Array.isArray(stored)) recents = stored.filter((item) => typeof item?.root === "string" && typeof item.id === "string").slice(0, 20); }
  catch (error) { if (error.code !== "ENOENT") console.warn("Recent project list could not be read."); }
  protocol.handle("margin", async (request) => {
    const url = new URL(request.url);
    const files = { "/": "index.html", "/index.html": "index.html", "/home.js": "home.js", "/home.css": "home.css", "/theme.css": "../public/theme.css", "/brand.svg": "../public/brand.svg", "/icons.svg": "../public/icons.svg", "/fonts/inter-latin-wght-normal.woff2": "../public/fonts/inter-latin-wght-normal.woff2", "/fonts/source-serif-4-latin-wght-normal.woff2": "../public/fonts/source-serif-4-latin-wght-normal.woff2" };
    if (url.host !== "app" || !Object.hasOwn(files, url.pathname)) return new Response("Not found", { status: 404 });
    const filename = files[url.pathname];
    const types = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".html": "text/html; charset=utf-8" };
    return new Response(await fs.readFile(path.join(directory, filename)), { headers: { "Content-Type": types[path.extname(filename)], "X-Content-Type-Options": "nosniff" } });
  });
  const desktopSession = session.defaultSession;
  desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const allowed = url.protocol === "margin:" && url.host === "app" || [...services].some((service) => url.origin === service.origin);
    callback({ cancel: !allowed });
  });
  desktopSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const service = [...services].find((item) => details.url.startsWith(`${item.origin}/`));
    callback({ requestHeaders: { ...details.requestHeaders, ...(service ? { "X-Margin-Desktop-Token": service.token } : {}) } });
  });
  desktopSession.on("will-download", (event) => event.preventDefault());
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 820, minHeight: 600, show: false, title: "Margin · 页边", backgroundColor: "#f6f5f2",
    webPreferences: { preload: path.join(directory, "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false, spellcheck: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== HOME && ![...services].some((service) => new URL(url).origin === service.origin && new URL(url).pathname === "/")) event.preventDefault();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(window, { type: "question", buttons: ["继续编辑", "放弃未保存内容"], defaultId: 0, cancelId: 0, title: "未保存的内容", message: "编辑器中有尚未保存的内容，是否放弃？" });
    if (choice === 1) event.preventDefault();
  });
  window.webContents.on("render-process-gone", () => { void showError(new Error("页面意外退出；已保存的审阅记录仍在本机。请重新启动应用。")); });
  window.on("closed", () => { window = null; });
  app.on("window-all-closed", () => {
    quitting = true;
    void Promise.all([...services].map(stopService)).then(() => app.quit());
  });
  app.on("before-quit", (event) => {
    if (window && !quitting) { event.preventDefault(); window.close(); }
  });
  ipcMain.handle("margin:desktop", async (event, message) => {
    const url = event.senderFrame?.url;
    const trusted = window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && (url === HOME || current && new URL(url).origin === current.origin);
    if (!trusted) return { ok: false, error: "此窗口不能操作工作区。" };
    try { return { ok: true, value: await enqueue(() => dispatch(message?.action, message?.value)) }; }
    catch (error) {
      // Detailed filesystem errors belong in a native dialog, not in renderer IPC.
      if (error.message === "navigation-cancelled") return { ok: true, value: null };
      await showError(error);
      return { ok: false, error: "操作未完成，请按提示检查文档后重试。" };
    }
  });
  installMenu();
  await window.loadURL(HOME);
  window.show();
  const initial = pendingPaths.shift() || commandPath(process.argv);
  if (initial) void enqueue(() => openPath(initial)).catch(showError);
}

function installMenu() {
  const action = (type) => () => { void enqueue(() => dispatch(type)).catch(showError); };
  const renderer = (type) => () => window?.webContents.send("margin:menu", type);
  const template = [
    ...(process.platform === "darwin" ? [{ label: "Margin", submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }] : []),
    { label: "文件", submenu: [
      { label: "新建工作区", accelerator: "CmdOrCtrl+N", click: action("new") },
      { label: "打开文档…", accelerator: "CmdOrCtrl+O", click: action("open-file") },
      { label: "打开项目…", accelerator: "CmdOrCtrl+Shift+O", click: action("open-folder") },
      { label: "导入审阅包…", click: action("import-package") },
      { type: "separator" },
      { label: "保存当前编辑", accelerator: "CmdOrCtrl+S", click: renderer("save") },
      { label: "导出正文…", click: renderer("export-document") },
      { label: "导出审阅包…", accelerator: "CmdOrCtrl+Shift+E", click: action("export-package") },
      { type: "separator" }, { label: "工作区首页", click: action("home") },
      { label: "在文件管理器中显示项目", click: action("reveal") },
      { role: process.platform === "darwin" ? "close" : "quit" },
    ] },
    { label: "编辑", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "视图", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }, ...(!app.isPackaged ? [{ role: "toggleDevTools" }] : [])] },
    { label: "窗口", submenu: [{ role: "minimize" }, { role: "zoom" }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
async function startService(project) {
  const token = randomBytes(32).toString("hex");
  const mcpToken = randomBytes(32).toString("hex");
  const child = utilityProcess.fork(path.join(directory, "service.mjs"), ["--repo", project.root, "--port", "0"], {
    cwd: project.root, env: { ...desktopEnvironment(), MARGIN_DESKTOP_TOKEN: token, MARGIN_MCP_TOKEN: mcpToken }, stdio: "pipe", serviceName: "Margin review service",
  });
  const service = { child, token, mcpToken, origin: null, project, stopping: false, exited: false };
  services.add(service);
  // Drain output; backend startup logs include local paths and stay out of IPC.
  child.stdout?.on("data", () => {});
  let diagnostic = "";
  child.stderr?.on("data", (chunk) => { diagnostic = (diagnostic + chunk.toString()).slice(-8000); });
  child.on("exit", () => {
    service.exited = true;
    services.delete(service);
    if (current === service && !service.stopping && window && !quitting) {
      void showError(new Error("本地审阅服务已停止；请从工作区首页重新打开项目。"));
    }
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("启动超时，请检查项目权限后重试。")), 20000);
      const fail = () => { clearTimeout(timer); reject(new Error(diagnostic.trim() || "无法启动此项目，请检查配置和文件权限。")); };
      child.once("exit", fail);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("message", (message) => {
        if (message?.type !== "ready" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(message.url)) return;
        service.origin = message.url;
        clearTimeout(timer);
        child.removeListener("exit", fail);
        resolve();
      });
    });
    return service;
  } catch (error) { await stopService(service); throw error; }
}
async function stopService(service) {
  if (!service || service.exited) return;
  service.stopping = true;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { service.child.kill(); resolve(); }, 4000);
    service.child.once("exit", () => { clearTimeout(timer); resolve(); });
    service.child.postMessage({ type: "shutdown" });
  });
  services.delete(service);
}
async function navigate(url) {
  if (!window) throw new Error("窗口已关闭。");
  try { await window.loadURL(url); }
  catch (error) { if (error.code === "ERR_ABORTED") throw new Error("navigation-cancelled"); throw error; }
  if (window.webContents.getURL() !== url) throw new Error("navigation-cancelled");
}
async function openProject(project) {
  const previous = current;
  const service = await startService(project);
  current = service;
  try { await navigate(`${service.origin}/?document=${encodeURIComponent(project.document)}`); }
  catch (error) { current = previous; await stopService(service); throw error; }
  await stopService(previous);
  recents = await rememberProject(recentFile, project);
  window.setTitle(`${project.label} — Margin`);
  return { opened: true };
}
async function openPath(filename) {
  if (typeof filename !== "string" || !path.isAbsolute(filename)) throw new Error("请选择本机文档或文件夹。");
  const stat = await fs.stat(filename);
  if (stat.isFile() && /\.(zip|marginreview|ppreview)$/i.test(filename)) return openProject(await restoreWorkspace(filename, managedRoot, path.basename(filename).replace(/\.(zip|marginreview|ppreview)$/i, "")));
  let root;
  let selected;
  if (stat.isDirectory()) {
    root = filename;
    if (!await exists(resolveConfigPath(root))) {
      const chosen = await dialog.showOpenDialog(window, { title: "选择项目入口文档", defaultPath: root, properties: ["openFile"], filters: [{ name: "Markdown / LaTeX", extensions: ["md", "tex"] }] });
      if (chosen.canceled) return null;
      selected = chosen.filePaths[0];
    }
  } else if (stat.isFile() && /\.(md|tex)$/i.test(filename)) {
    selected = filename;
    root = await findProject(filename) || path.dirname(filename);
  } else throw new Error("请选择 Markdown、LaTeX、审阅包或项目文件夹。");
  return openProject(await prepareProject(root, selected, appRoot));
}
async function exportFile(kind, relative) {
  if (!current) throw new Error("请先打开工作区。");
  const service = current;
  let content;
  let defaultName = "margin-review.marginreview";
  if (kind === "mcp") {
    defaultName = "margin-mcp.json";
    content = Buffer.from(JSON.stringify({ mcpServers: { margin: { type: "http", url: `${service.origin}/mcp`, headers: { "X-Margin": "1", Authorization: `Bearer ${service.mcpToken}`, "X-Margin-Desktop-Token": service.mcpToken } } } }, null, 2) + "\n");
  } else if (kind === "document") {
    if (typeof relative !== "string" || path.isAbsolute(relative) || !/\.(md|tex)$/i.test(relative)) throw new Error("请先打开要导出的文档。");
    const response = await fetch(`${service.origin}/api/document?path=${encodeURIComponent(relative)}`, { headers: { "X-Margin-Desktop-Token": service.token } });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    content = Buffer.from(value.source);
    defaultName = path.basename(relative);
  } else {
    const response = await fetch(`${service.origin}/api/review/export`, { headers: { "X-Margin-Desktop-Token": service.token } });
    if (!response.ok) throw new Error((await response.json()).error);
    content = Buffer.from(await response.arrayBuffer());
  }
  const choice = await dialog.showSaveDialog(window, { title: kind === "mcp" ? "导出本次工作区的 MCP 连接配置" : kind === "document" ? "导出正文" : "导出审阅包", defaultPath: path.join(app.getPath("documents"), defaultName), filters: [{ name: kind === "mcp" ? "MCP 配置" : kind === "document" ? "文档" : "Margin 审阅包", extensions: kind === "mcp" ? ["json"] : kind === "document" ? [path.extname(defaultName).slice(1)] : ["marginreview", "zip"] }] });
  if (choice.canceled || !choice.filePath) return null;
  // Export is not a tracked edit: do not let a save dialog overwrite a project
  // source or its private history under the guise of exporting a copy.
  const realParent = await fs.realpath(path.dirname(choice.filePath));
  let destination = path.join(realParent, path.basename(choice.filePath));
  if (await exists(destination)) destination = await fs.realpath(destination);
  const relativeDestination = path.relative(service.project.root, destination);
  if (relativeDestination === "" || !relativeDestination.startsWith(`..${path.sep}`) && relativeDestination !== ".." && !path.isAbsolute(relativeDestination)) throw new Error("请将导出副本保存到当前项目文件夹之外。");
  await atomicFile(destination, content);
  return { saved: true, name: path.basename(destination) };
}
async function dispatch(action, value) {
  if (action === "open-link") {
    if (typeof value !== "string" || value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) throw new Error("此链接无法打开。");
    let url;
    try { url = new URL(value); } catch { throw new Error("此链接无法打开。"); }
    if (!["https:", "http:", "mailto:"].includes(url.protocol)) throw new Error("只支持网页或邮件链接。");
    await shell.openExternal(url.href);
    return null;
  }
  if (action === "theme") {
    if (value !== undefined) {
      if (!["light", "dark"].includes(value)) throw new Error("请选择浅色或深色主题。");
      await atomicFile(path.join(app.getPath("userData"), "appearance.json"), JSON.stringify({ theme: value }) + "\n");
      appearance = value;
    }
    return appearance;
  }
  if (action === "reveal") {
    if (current) await shell.openPath(current.project.root);
    return null;
  }
  if (action === "recents") return recents.map(({ id, label, document }) => ({ id, label, document }));
  if (action === "open-path") return openPath(value);
  if (action === "recent") {
    const recent = recents.find((item) => item.id === value);
    if (!recent) throw new Error("最近项目不存在，请重新选择文件夹。");
    return openProject(await prepareProject(recent.root, path.resolve(recent.root, recent.document), appRoot));
  }
  if (action === "new") return openProject(await createWorkspace(managedRoot));
  if (action === "home") {
    await navigate(HOME);
    await stopService(current);
    current = null;
    return null;
  }
  if (action === "export-package") return exportFile("package");
  if (action === "export-document") return exportFile("document", value);
  if (action === "export-mcp") return exportFile("mcp");
  if (!["open-file", "open-folder", "import-package"].includes(action)) throw new Error("未知桌面操作。");
  const folder = action === "open-folder";
  const chosen = await dialog.showOpenDialog(window, {
    title: folder ? "打开项目文件夹" : action === "import-package" ? "导入审阅包到新工作区" : "打开文档",
    properties: [folder ? "openDirectory" : "openFile"],
    ...(folder ? {} : { filters: [{ name: action === "import-package" ? "审阅包" : "Markdown / LaTeX", extensions: action === "import-package" ? ["zip", "marginreview", "ppreview"] : ["md", "tex"] }] }),
  });
  if (chosen.canceled) return null;
  return openPath(chosen.filePaths[0]);
}
