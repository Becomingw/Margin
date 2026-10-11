#!/usr/bin/env node
// Configure Margin for a Markdown or LaTeX project. Never prompts: everything is a
// flag, the result can be printed as JSON (--json), and every failure has its
// own exit code, so a person, a script or a coding agent can drive it.
//
// Exit codes: 0 ok · 2 usage · 3 project not found · 4 no main .tex found ·
//             5 several candidates (listed) · 6 configuration already exists
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_PROVIDERS, resolveExecutable,
} from "../agent-providers.mjs";
import { isInside } from "../config.mjs";
import { loadEnvFile } from "../env.mjs";
import { APP_NAME, CONFIG_NAME, LEGACY_CONFIG_NAME, LOCAL_POINTER_NAME, STATE_DIR_NAME, resolveStateDir } from "../names.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const wantsJson = argv.includes("--json");

const EXIT = { ok: 0, usage: 2, projectNotFound: 3, noMain: 4, severalMain: 5, configExists: 6 };

const usageText = [
  "Usage: npm run setup -- /path/to/document-or-project [options]",
  "       node scripts/setup.mjs /path/to/document-or-project [options]",
  "",
  "Options:",
  "  --repo <dir>              The project directory (same as the positional argument)",
  "  --main <file.md|file.tex> Manuscript entry point, relative to the project",
  "                            (default: main.tex or main.md, else a detected document)",
  "  --source <dir>            Restrict readable/writable sources (default: .)",
  "  --title <name>            Name shown in the app (default: the folder name)",
  "  Legacy AI flags are accepted but ignored; no provider or key is needed.",
  "  --compile / --no-compile  Enable or disable PDF compilation (default: enabled when latexmk is on PATH)",
  "  --no-remember             Do not make this the checkout's default project",
  `  --force                   Replace an existing ${CONFIG_NAME}`,
  "  --json                    Print one JSON object instead of text",
  "  --yes                     Accepted for compatibility; setup never asks questions",
  "  --help                    Show this text",
  "",
  `Writes ${CONFIG_NAME} with the settings a project usually changes. Every other field`,
  "has a default; margin.config.example.json and docs/configuration.md show the full shape.",
  "",
  "Exit codes: 0 ok, 2 usage, 3 project not found, 4 no entry document found,",
  `            5 several candidates, 6 ${CONFIG_NAME} already exists`,
].join("\n");

function finish(code, payload, humanLines) {
  if (wantsJson) console.log(JSON.stringify(payload, null, 2));
  else if (code === EXIT.ok) console.log(humanLines.join("\n"));
  else console.error(`\n${humanLines.join("\n")}\n`);
  process.exit(code);
}

function fail(exitCode, code, message, extra = {}) {
  const lines = [message];
  if (extra.candidates) lines.push(...extra.candidates.map((value) => `  - ${value}`));
  if (exitCode === EXIT.usage) lines.push("", usageText);
  finish(exitCode, { ok: false, error: { code, message, ...extra } }, lines);
}

// Options that consume the next argument. Everything else starting with "--"
// is a plain flag, so "--no-compile /path/to/project" keeps its positional.
const valueOptions = new Set(["--repo", "--main", "--source", "--title", "--provider", "--model", "--chat-model", "--review-language"]);
const flagOptions = new Set(["--yes", "-y", "--json", "--force", "--compile", "--no-compile", "--no-remember", "--help", "-h"]);

const values = {};
const flags = new Set();
const positionals = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (valueOptions.has(arg)) {
    const value = argv[index + 1];
    if (value === undefined || (value.startsWith("--") && (valueOptions.has(value) || flagOptions.has(value)))) {
      fail(EXIT.usage, "usage", `${arg} needs a value.`);
    }
    values[arg] = value;
    index += 1;
  } else if (flagOptions.has(arg)) flags.add(arg);
  else if (arg.startsWith("-")) fail(EXIT.usage, "usage", `Unknown option: ${arg}`);
  else positionals.push(arg);
}

if (flags.has("--help") || flags.has("-h")) {
  console.log(usageText);
  process.exit(0);
}
if (flags.has("--compile") && flags.has("--no-compile")) fail(EXIT.usage, "usage", "Use either --compile or --no-compile, not both.");
if (positionals.length > 1) fail(EXIT.usage, "usage", `Expected one project directory, got ${positionals.length}: ${positionals.join(", ")}`);

loadEnvFile(appRoot);

const projectValue = values["--repo"] || positionals[0];
if (!projectValue) fail(EXIT.usage, "usage", "No project directory given.");
let repoRoot = path.resolve(projectValue);
let projectStat = null;
try {
  projectStat = await fs.stat(repoRoot);
} catch {
  // Reported below.
}
if (projectStat?.isFile() && /\.(md|tex)$/i.test(repoRoot)) {
  values["--main"] ||= path.basename(repoRoot);
  repoRoot = path.dirname(repoRoot);
} else if (!projectStat?.isDirectory()) fail(EXIT.projectNotFound, "project_not_found", `Project directory does not exist: ${repoRoot}`);

const configPath = path.join(repoRoot, CONFIG_NAME);
if (existsSync(configPath) && !flags.has("--force")) {
  fail(EXIT.configExists, "config_exists", `A configuration already exists at ${configPath}. Pass --force to replace it.`, { configPath });
}

const provider = values["--provider"] ? String(values["--provider"]).toLowerCase() : null;
if (provider && !AGENT_PROVIDERS.includes(provider)) {
  fail(EXIT.usage, "usage", `Unknown provider "${values["--provider"]}". Use one of: ${AGENT_PROVIDERS.join(", ")}.`);
}

const skippedDirectories = new Set(["node_modules", "build", "dist", "out", "output", "vendor", "_minted", "__pycache__"]);

// Every .tex that can be compiled on its own: it contains an uncommented
// \documentclass. Depth <= 4; hidden and build directories are skipped.
async function findMainCandidates(root, directory = root, depth = 0) {
  if (depth > 4) return [];
  const matches = [];
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return matches;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name) || /^_minted/.test(entry.name)) continue;
      matches.push(...await findMainCandidates(root, target, depth + 1));
    } else if (entry.isFile() && /[.](tex|md)$/i.test(entry.name)) {
      if (/\.md$/i.test(entry.name)) {
        matches.push(path.relative(root, target).split(path.sep).join("/"));
        continue;
      }
      let head = "";
      try {
        const handle = await fs.open(target, "r");
        try {
          const { bytesRead, buffer } = await handle.read(Buffer.alloc(65536), 0, 65536, 0);
          head = buffer.subarray(0, bytesRead).toString("utf8");
        } finally {
          await handle.close();
        }
      } catch {
        continue;
      }
      if (/^[^%\n]*\\documentclass\b/m.test(head)) matches.push(path.relative(root, target).split(path.sep).join("/"));
    }
  }
  return matches;
}

let main = values["--main"] ? values["--main"].replaceAll("\\", "/").replace(/^\.\//, "") : null;
let mainDetection = "flag";
if (!main) {
  if (existsSync(path.join(repoRoot, "main.tex")) && existsSync(path.join(repoRoot, "main.md"))) {
    fail(EXIT.severalMain, "several_main_tex", "Several files could be the manuscript entry point. Pass --main <file.md|file.tex> to choose one:", { candidates: ["main.md", "main.tex"] });
  }
  if (existsSync(path.join(repoRoot, "main.tex"))) {
    main = "main.tex";
    mainDetection = "main.tex";
  } else if (existsSync(path.join(repoRoot, "main.md"))) {
    main = "main.md";
    mainDetection = "main.md";
  } else {
    const candidates = await findMainCandidates(repoRoot);
    const named = candidates.filter((value) => /^main\.(md|tex)$/i.test(path.posix.basename(value)));
    if (candidates.length === 1) main = candidates[0];
    else if (named.length === 1) main = named[0];
    else if (!candidates.length) {
      fail(EXIT.noMain, "no_main_tex", `No Markdown or LaTeX entry point was found under ${repoRoot}. Pass --main <file.md|file.tex>.`);
    } else {
      fail(EXIT.severalMain, "several_main_tex", "Several files could be the manuscript entry point. Pass --main <file.md|file.tex> to choose one:", { candidates });
    }
    mainDetection = "documentclass";
  }
}
const absoluteMain = path.resolve(repoRoot, main);
if (!isInside(repoRoot, absoluteMain) || !/\.(md|tex)$/i.test(main) || !existsSync(absoluteMain) || !(await fs.stat(absoluteMain)).isFile()) {
  fail(EXIT.noMain, "no_main_tex", `Manuscript entry point does not exist inside the project: ${main}`);
}
const sourceRoot = (values["--source"] || ".").replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "") || ".";
if (!existsSync(path.resolve(repoRoot, sourceRoot)) || !isInside(repoRoot, path.resolve(repoRoot, sourceRoot))) {
  fail(EXIT.usage, "usage", `--source does not exist inside the project: ${sourceRoot}`);
}
if (!isInside(path.resolve(repoRoot, sourceRoot), absoluteMain)) {
  fail(EXIT.usage, "usage", "The manuscript entry point must be inside --source.");
}

// Compilation: an explicit flag wins; otherwise on when latexmk is installed.
const latexmkFound = Boolean(resolveExecutable("latexmk"));
const compile = flags.has("--no-compile")
  ? { enabled: false, decidedBy: "flag" }
  : flags.has("--compile")
    ? { enabled: true, decidedBy: "flag" }
    : { enabled: latexmkFound, decidedBy: "auto" };
if (/\.md$/i.test(main)) compile.enabled = false;
compile.latexmkFound = latexmkFound;

const mainDirectory = path.posix.dirname(main);
const mainName = path.posix.basename(main);
const config = {
  title: values["--title"] || path.basename(repoRoot),
  projectLabel: "Local review workspace",
  sourceRoot,
  defaultDocument: main,
  pdf: path.posix.join(mainDirectory, mainName.replace(/[.](tex|md)$/i, ".pdf")),
  latex: {
    enabled: compile.enabled,
    cwd: mainDirectory,
    command: "latexmk",
    args: ["-pdf", "-interaction=nonstopmode", "-halt-on-error", mainName],
  },
  agent: { enabled: false },
  approvedDocuments: [],
};

await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: flags.has("--force") ? "w" : "wx" });
// New projects get .margin/. A project that already has state under the
// pre-rename directory keeps using it, so nothing is lost or duplicated.
const stateRoot = resolveStateDir(repoRoot);
await fs.mkdir(stateRoot, { recursive: true });
await fs.writeFile(path.join(stateRoot, ".gitignore"), "*\n", "utf8");
const remembered = !flags.has("--no-remember");
if (remembered) {
  await fs.writeFile(path.join(appRoot, LOCAL_POINTER_NAME), `${JSON.stringify({ repo: repoRoot }, null, 2)}\n`, "utf8");
}

const quote = (value) => (/[\s"']/.test(value) ? `"${value}"` : value);
const repoFlag = remembered ? "" : ` -- --repo ${quote(repoRoot)}`;
const next = [`npm run doctor${repoFlag}`, `npm start${repoFlag}`];
const notes = [];
if (values["--provider"] || values["--model"] || values["--chat-model"] || values["--review-language"]) notes.push("Legacy AI options were ignored; this workspace uses manual review.");
if (!compile.enabled && compile.decidedBy === "auto" && /\.tex$/i.test(main)) notes.push("latexmk was not found on PATH, so PDF compilation is off. Install a LaTeX distribution and re-run with --compile --force to turn it on.");
if (compile.enabled && !latexmkFound) notes.push("PDF compilation is on, but latexmk was not found on PATH.");
if (existsSync(path.join(repoRoot, LEGACY_CONFIG_NAME))) notes.push(`${LEGACY_CONFIG_NAME} is still present; ${CONFIG_NAME} takes precedence and the old file can be deleted.`);
if (path.basename(stateRoot) !== STATE_DIR_NAME) notes.push(`Existing review state in ${path.basename(stateRoot)}/ is kept and used as is.`);

finish(EXIT.ok, {
  ok: true,
  configPath,
  project: repoRoot,
  defaultDocument: main,
  mainDetectedBy: mainDetection,
  mode: "manual-review",
  formats: ["markdown", "latex"],
  compile: compile.enabled,
  compileStatus: { decidedBy: compile.decidedBy, latexmkFound },
  stateDirectory: path.basename(stateRoot),
  remembered,
  notes,
  next,
}, [
  `${APP_NAME} is configured for ${repoRoot}`,
  `  Configuration: ${configPath}`,
  `  Manuscript:    ${main}`,
  "  Review:        manual; no AI backend required",
  `  PDF compile:   ${compile.enabled ? "on" : "off"}${compile.decidedBy === "auto" ? ` (latexmk ${latexmkFound ? "found" : "not found"})` : ""}`,
  ...notes.map((note) => `  Note: ${note}`),
  "",
  `Next: ${next.join("  then  ")}`,
]);
