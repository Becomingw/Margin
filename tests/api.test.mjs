import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, it } from "node:test";
import { api, apiOk, cleanupAll, makeProject, makeTempDir, startServer } from "./helpers.mjs";
import { loadEnvFile, parseEnv } from "../env.mjs";

after(cleanupAll);

it("retains .env parsing and shell precedence for local machine settings", async () => {
  assert.deepEqual(parseEnv('# comment\r\nexport PORT=4317\r\nTEXT="a # b\\nnext"\r\nSINGLE=\'literal \\n $HOME\'\r\nTRAILING=abc # comment\r\nEMPTY=\r\n1BAD=no\r\n'), { PORT: "4317", TEXT: "a # b\nnext", SINGLE: "literal \\n $HOME", TRAILING: "abc", EMPTY: "" });
  const root = await makeTempDir();
  await fs.writeFile(path.join(root, ".env"), "FROM_FILE=file\nALREADY_SET=file\nBLANK=\n");
  const env = { ALREADY_SET: "shell" };
  const report = loadEnvFile(root, env);
  assert.deepEqual(env, { ALREADY_SET: "shell", FROM_FILE: "file" });
  assert.deepEqual(report.loaded, ["FROM_FILE"]);
  assert.deepEqual(report.skipped, ["ALREADY_SET"]);
  const disabled = { MARGIN_ENV_FILE: "none" };
  loadEnvFile(root, disabled);
  assert.equal(disabled.FROM_FILE, undefined);
});

it("health describes both formats without provider credentials or machine paths", async () => {
  const project = await makeProject();
  const server = await startServer(project.root, { env: { OPENAI_API_KEY: "sk-fixture-secret-123456" } });
  const health = await apiOk(server, "/api/health");
  assert.equal(health.ok, true);
  assert.deepEqual(health.formats, ["markdown", "latex"]);
  assert.deepEqual(health.agent, { enabled: false });
  assert.equal(health.reviewPackageVersion, 1);
  assert.ok(!JSON.stringify(health).includes(project.root));
  assert.ok(!JSON.stringify(health).includes("sk-fixture-secret-123456"));
});

it("review writes keep the request boundary and optimistic concurrency", async () => {
  const project = await makeProject();
  const server = await startServer(project.root);
  const review = await apiOk(server, "/api/review?path=main.tex");
  const revision = review.document.revisions.at(-1);
  const body = { path: "main.tex", etag: revision.hash, text: revision.source + "\n% human edit\n" };
  const foreign = await fetch(`${server.baseUrl}/api/review/save`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://foreign.invalid" }, body: JSON.stringify(body) });
  assert.equal(foreign.status, 403);
  assert.equal((await api(server, "/api/review/save", { method: "POST", body })).status, 200);
  assert.equal((await api(server, "/api/review/save", { method: "POST", body })).status, 409);
  const current = await apiOk(server, "/api/review?path=main.tex");
  assert.equal(current.document.revisions.length, 2);
});
