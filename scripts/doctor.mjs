#!/usr/bin/env node
// Local checks only: even legacy --ping never contacts a model provider.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactSecrets, resolveExecutable } from "../agent-providers.mjs";
import { loadReviewConfig } from "../config.mjs";
import { loadEnvFile } from "../env.mjs";
import { APP_NAME, CONFIG_NAME, appVersion, hostFromEnvironment } from "../names.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("Usage: npm run doctor -- [--repo <dir>] [--config <file>] [--port <n>] [--json]\nChecks Node, KaTeX, the project and optional LaTeX compilation. No AI backend is required.\nLegacy --ping is ignored.");
  process.exit(0);
}
loadEnvFile(appRoot);
const checks = [];
function check(id, ok, severity, detail, fix = null) {
  checks.push({ id, ok: Boolean(ok), severity, detail: redactSecrets(detail), fix: ok ? null : fix });
}
check("node", Number(process.versions.node.split(".")[0]) >= 20, "error", `Node.js ${process.versions.node}`, "Install Node.js 20 or newer.");
let katexFound = false;
try {
  katexFound = existsSync(path.join(path.dirname(createRequire(import.meta.url).resolve("katex/package.json")), "dist", "katex.min.js"));
} catch { /* reported below */ }
check("katex", katexFound, "error", katexFound ? "katex is installed" : "katex is missing", 'Run "npm install" in the Margin folder.');
let loaded;
try {
  loaded = await loadReviewConfig({ appRoot, argv });
  check("config", true, "error", loaded.configPath);
  check("main-document", true, "error", `${loaded.config.defaultDocument} in ${loaded.repoRoot}`);
} catch (error) {
  const aboutDocument = /defaultDocument|sourceRoot|initialDocument/.test(error.message);
  if (aboutDocument) check("config", true, "error", "configuration file found and readable");
  check(aboutDocument ? "main-document" : "config", false, "error", error.message, `Fix ${CONFIG_NAME}, or run "npm run setup -- <document-or-project>".`);
}
if (loaded) {
  const { latex } = loaded.config;
  const found = Boolean(resolveExecutable(latex.command));
  check("latex", !latex.enabled || found, latex.enabled ? "error" : "info", latex.enabled ? `${latex.command}: ${found ? "found" : "not found"}` : "PDF compilation is disabled", `Install a LaTeX distribution that provides ${latex.command}, or set latex.enabled to false.`);
}
check("review", true, "info", "Manual Markdown and LaTeX review; no AI backend or API key required.");
const ok = !checks.some((item) => !item.ok && item.severity === "error");
if (argv.includes("--json")) console.log(JSON.stringify({ ok, name: "margin", version: appVersion(), checks }, null, 2));
else {
  console.log(`${APP_NAME} ${appVersion()} doctor\n`);
  for (const item of checks) {
    console.log(`${item.ok ? "✓" : "✗"} ${item.id}: ${item.detail}`);
    if (!item.ok) console.log(`    fix: ${item.fix}`);
  }
  console.log(ok ? `\nReady. Start Margin and open http://${hostFromEnvironment()}:${loaded?.port || 4317}` : "\nNot ready: fix the lines marked ✗, then run doctor again.");
}
process.exit(ok ? 0 : 1);
