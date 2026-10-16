import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isInside, loadReviewConfig } from "../config.mjs";
import { CONFIG_NAME, resolveConfigPath } from "../names.mjs";
import { importReviewPackage, PACKAGE_LIMIT } from "../review-package.mjs";
import { createReviewStore, safeReviewPath } from "../review-store.mjs";

export async function atomicFile(filename, content) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, content, { mode: 0o600 }); await fs.rename(temporary, filename); }
  finally { await fs.rm(temporary, { force: true }); }
}
export async function exists(filename) {
  try { await fs.access(filename); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
export function desktopEnvironment(env = process.env) {
  const names = ["PATH", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "SYSTEMROOT", "SystemRoot", "WINDIR", "ComSpec", "COMSPEC", "PATHEXT", "TMP", "TEMP", "TMPDIR", "LANG", "LC_ALL"];
  return { ...Object.fromEntries(names.filter((name) => env[name] !== undefined).map((name) => [name, env[name]])), MARGIN_HOST: "127.0.0.1", MARGIN_ENV_FILE: "none" };
}
export function projectConfig(root, document) {
  return { title: path.basename(root), sourceRoot: ".", defaultDocument: document, latex: { enabled: false }, agent: { enabled: false }, ui: { initialDocument: document } };
}
export async function findProject(filename) {
  let directory = path.dirname(filename);
  while (true) {
    if (await exists(resolveConfigPath(directory))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}
export async function prepareProject(root, selected, appRoot) {
  root = await fs.realpath(root);
  let document;
  if (selected) {
    const real = await fs.realpath(selected);
    if (!isInside(root, real) || !/\.(md|tex)$/i.test(real) || !(await fs.stat(real)).isFile()) throw new Error("请选择项目内的 Markdown 或 LaTeX 文件。");
    document = path.relative(root, real).split(path.sep).join("/");
  }
  if (!await exists(resolveConfigPath(root))) {
    if (!document) throw new Error("请选择项目入口文档。");
    await fs.writeFile(path.join(root, CONFIG_NAME), JSON.stringify(projectConfig(root, document), null, 2) + "\n", { flag: "wx" });
  }
  const loaded = await loadReviewConfig({ appRoot, argv: ["--repo", root], env: desktopEnvironment() });
  document ||= loaded.config.ui.initialDocument;
  const sourceRoot = await fs.realpath(path.resolve(root, loaded.config.sourceRoot));
  if (!isInside(sourceRoot, await fs.realpath(path.resolve(root, document)))) throw new Error("所选文件必须在项目的 sourceRoot 内。");
  return { root, document, label: loaded.config.title || path.basename(root) };
}
export async function createWorkspace(parent, label = "新工作区") {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "review-"));
  try {
    await fs.writeFile(path.join(root, "notes.md"), "# 新文档\n\n", { flag: "wx" });
    await fs.writeFile(path.join(root, CONFIG_NAME), JSON.stringify({ ...projectConfig(root, "notes.md"), title: label }, null, 2) + "\n");
    return { root, document: "notes.md", label };
  } catch (error) { await fs.rm(root, { recursive: true, force: true }); throw error; }
}
export async function restoreWorkspace(archive, parent, label) {
  const stat = await fs.stat(archive);
  if (!stat.isFile() || stat.size > PACKAGE_LIMIT) throw new Error("请选择不超过 32 MiB 的审阅包。");
  const { state, assets } = importReviewPackage(await fs.readFile(archive));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "review-"));
  try {
    const stateRoot = path.join(root, ".margin");
    await fs.mkdir(stateRoot);
    await fs.writeFile(path.join(stateRoot, ".gitignore"), "*\n");
    const target = (relative) => path.join(root, safeReviewPath(relative));
    const read = async (name, encoding) => {
      try { return (await fs.readFile(target(name))).toString(encoding); }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
    };
    const write = async (name, bytes) => { const file = target(name); await fs.mkdir(path.dirname(file), { recursive: true }); await atomicFile(file, bytes); };
    const store = createReviewStore({
      root: stateRoot, atomicWrite: atomicFile, listDocuments: async () => [],
      readSource: (name) => read(name, "utf8"), writeSource: write,
      readResource: (name) => read(name, "base64"), writeResource: (name, bytes) => write(name, Buffer.from(bytes, "base64")),
    });
    const imported = await store.importState(state, "manuscript", assets);
    const document = imported.documents[0].path;
    await fs.writeFile(path.join(root, CONFIG_NAME), JSON.stringify({ ...projectConfig(root, document), title: label }, null, 2) + "\n");
    return { root, document, label };
  } catch (error) { await fs.rm(root, { recursive: true, force: true }); throw error; }
}
export async function rememberProject(filename, project) {
  let previous = [];
  try { previous = JSON.parse(await fs.readFile(filename, "utf8")); }
  catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  if (!Array.isArray(previous)) previous = [];
  const existing = previous.find((item) => item.root === project.root);
  const record = { ...project, id: existing?.id || randomUUID(), openedAt: new Date().toISOString() };
  const recent = [record, ...previous.filter((item) => item.root !== project.root)].slice(0, 20);
  await atomicFile(filename, JSON.stringify(recent, null, 2) + "\n");
  return recent;
}
