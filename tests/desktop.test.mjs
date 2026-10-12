import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { after, it } from "node:test";
import { appRoot, apiOk, cleanupAll, makeProject, makeTempDir, startServer } from "./helpers.mjs";
import { createWorkspace, desktopEnvironment, findProject, prepareProject, rememberProject, restoreWorkspace } from "../desktop/workspaces.mjs";
import { childEnvironment, redactSecrets } from "../agent-providers.mjs";
after(cleanupAll);

it("macOS packaging can parse application property lists with its installed dependencies", () => {
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve("app-builder-lib"));
  const plist = builderRequire("plist");
  const metadata = { CFBundleName: "Margin", CFBundleShortVersionString: "0.2.1" };
  assert.deepEqual(plist.parse(plist.build(metadata)), metadata);
});

it("desktop tokens are redacted and never inherited by project children", () => {
  const previous = process.env.MARGIN_DESKTOP_TOKEN;
  process.env.MARGIN_DESKTOP_TOKEN = "fixture-private-desktop-token";
  try {
    assert.equal(childEnvironment().MARGIN_DESKTOP_TOKEN, undefined);
    assert.equal(redactSecrets("token=fixture-private-desktop-token"), "token=[redacted]");
  } finally {
    if (previous === undefined) delete process.env.MARGIN_DESKTOP_TOKEN;
    else process.env.MARGIN_DESKTOP_TOKEN = previous;
  }
});

it("desktop environment strips credentials, inherited runtime flags and bind overrides", () => {
  const env = desktopEnvironment({ PATH: "/bin", HOME: "/home", OPENAI_API_KEY: "secret", MARGIN_HOST: "0.0.0.0", NODE_OPTIONS: "--inspect", ELECTRON_RUN_AS_NODE: "1" });
  assert.deepEqual(env, { PATH: "/bin", HOME: "/home", MARGIN_HOST: "127.0.0.1", MARGIN_ENV_FILE: "none" });
});
it("opening an existing project preserves its configuration and source", async () => {
  const project = await makeProject();
  const config = await fs.readFile(path.join(project.root, ".margin.json"));
  const selected = path.join(project.root, "sections/01_introduction.tex");
  assert.equal(await findProject(selected), project.root);
  assert.equal((await prepareProject(project.root, selected, appRoot)).document, "sections/01_introduction.tex");
  assert.ok((await fs.readFile(path.join(project.root, ".margin.json"))).equals(config));
  const outside = await makeTempDir();
  await fs.writeFile(path.join(outside, "outside.md"), "# Outside\n");
  await assert.rejects(prepareProject(project.root, path.join(outside, "outside.md"), appRoot), /项目内/);
});
it("creates persistent workspaces and deduplicates the recent list", async () => {
  const parent = await makeTempDir();
  const workspace = await createWorkspace(parent);
  assert.equal((await prepareProject(workspace.root, null, appRoot)).document, "notes.md");
  const recentFile = path.join(parent, "recent.json");
  const first = await rememberProject(recentFile, workspace);
  const second = await rememberProject(recentFile, { ...workspace, label: "Renamed" });
  assert.equal(second.length, 1);
  assert.equal(first[0].id, second[0].id);
  assert.equal(second[0].label, "Renamed");
});
it("restores a review package to a new desktop workspace without a placeholder document", async () => {
  const project = await makeProject({ files: { "main.md": "# Review\n\nText.\n" } });
  const server = await startServer(project.root);
  const before = await apiOk(server, "/api/review?path=main.md");
  await apiOk(server, "/api/review/comment", { method: "POST", body: { path: "main.md", etag: before.document.revisions[0].hash, start: 10, end: 14, body: "Check evidence." } });
  const parent = await makeTempDir();
  const archive = path.join(parent, "handoff.marginreview");
  await fs.writeFile(archive, Buffer.from(await (await fetch(`${server.baseUrl}/api/review/export`)).arrayBuffer()));
  const restored = await restoreWorkspace(archive, path.join(parent, "workspaces"), "Handoff");
  const receiver = await startServer(restored.root);
  const actual = await apiOk(receiver, `/api/review?path=${restored.document}`);
  assert.equal(actual.document.id, before.document.id);
  assert.equal(actual.comments[0].body, "Check evidence.");
  assert.equal((await apiOk(receiver, "/api/bootstrap")).documents.length, 1);
  const dirs = await fs.readdir(path.join(parent, "workspaces"));
  await fs.writeFile(archive, "bad archive");
  await assert.rejects(restoreWorkspace(archive, path.join(parent, "workspaces"), "Bad"));
  assert.deepEqual(await fs.readdir(path.join(parent, "workspaces")), dirs);
});
it("a desktop backend rejects requests without its private token", async () => {
  const project = await makeProject();
  const token = "fixture-desktop-token";
  // startServer waits on the banner, so no unauthenticated health probe is needed.
  const server = await startServer(project.root, { env: { MARGIN_DESKTOP_TOKEN: token } });
  assert.equal((await fetch(`${server.baseUrl}/api/health`)).status, 403);
  const response = await fetch(`${server.baseUrl}/api/health`, { headers: { "X-Margin-Desktop-Token": token } });
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(token));
});
