#!/usr/bin/env node
// margin <command> [args]: a thin dispatcher usable without npm.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commands = {
  setup: "scripts/setup.mjs",
  doctor: "scripts/doctor.mjs",
  start: "server.mjs",
  demo: "scripts/demo.mjs",
  mcp: "bin/margin-mcp.mjs",
};
const usage = [
  "Usage: margin <command> [options]",
  "",
  "  setup <document-or-project> [options]   Configure Markdown or LaTeX review (never prompts)",
  "  doctor [--json]                Check Node, KaTeX, the project and optional LaTeX",
  "  start [--repo dir] [--port n] [--open]   Start the local server",
  "  demo [--port n] [--open]        Run on a throwaway copy of the bundled sample paper",
  "  mcp                           Connect an external agent over stdio (MARGIN_MCP_URL/TOKEN)",
  "",
  "  margin --version | --help",
].join("\n");

const [command, ...rest] = process.argv.slice(2);
if (command === "--version" || command === "-v") {
  console.log(JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8")).version);
  process.exit(0);
}
if (!command || command === "--help" || command === "-h" || command === "help") {
  console.log(usage);
  process.exit(command ? 0 : 2);
}
if (!Object.hasOwn(commands, command)) {
  console.error(`Unknown command "${command}".\n\n${usage}`);
  process.exit(2);
}
// The user's working directory is kept, so relative project paths resolve as typed.
const child = spawn(process.execPath, [path.join(appRoot, commands[command]), ...rest], { stdio: "inherit" });
// Ctrl+C in a terminal already reaches the whole foreground process group, so
// SIGINT is forwarded only when there is no terminal; SIGTERM always is.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (signal === "SIGINT" && process.stdin.isTTY) return;
    if (child.exitCode === null && !child.signalCode) child.kill(signal);
  });
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
