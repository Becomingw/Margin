// AI execution was removed from the review workspace. Verify that even an old
// configured project cannot invoke a model or change source via those routes.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, it } from "node:test";
import { api, apiOk, cleanupAll, makeProject, startServer, startMockApi } from "./helpers.mjs";

after(cleanupAll);

it("retires every AI entry point, even with an enabled legacy provider", async () => {
  const mock = await startMockApi();
  const project = await makeProject({ config: { agent: { enabled: true, provider: "ollama" }, ollama: { model: "fixture", baseUrl: `${mock.origin}/v1` } } });
  const server = await startServer(project.root);
  const before = await fs.readFile(path.join(project.root, "main.tex"));
  for (const endpoint of ["/api/rewrite", "/api/request/process", "/api/request/accept", "/api/chat/message", "/api/chat/create-proposal", "/api/document/review", "/api/structure/section-rewrite"]) {
    assert.equal((await api(server, endpoint, { method: "POST", body: { path: "main.tex", comment: "test", message: "test" } })).status, 410, endpoint);
  }
  assert.equal(mock.requests.length, 0);
  assert.ok((await fs.readFile(path.join(project.root, "main.tex"))).equals(before));
  assert.deepEqual((await apiOk(server, "/api/bootstrap")).agent, { enabled: false, providers: [] });
  const html = await (await fetch(`${server.baseUrl}/`)).text();
  assert.doesNotMatch(html, /agent-provider|codex-chat|Review file/);
});
