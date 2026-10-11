// Margin owns its namespace. Legacy filenames are data migration fallbacks only;
// setup writes new names and inherited host/permission variables are ignored.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const APP_ID = "margin";
export const APP_NAME = "Margin";

// Project configuration file (usually committed with the manuscript).
export const CONFIG_NAME = ".margin.json";
export const LEGACY_CONFIG_NAME = ".draft-review.json";
// Per-project state directory (never committed).
export const STATE_DIR_NAME = ".margin";
export const LEGACY_STATE_DIR_NAME = ".draft-review";
// App-local pointer to the project remembered by setup.
export const LOCAL_POINTER_NAME = "margin.local.json";
export const LEGACY_LOCAL_POINTER_NAME = "review.local.json";
// Prefix of every temporary file and directory.
export const TEMP_PREFIX = "margin-";

export const ENV = {
  host: "MARGIN_HOST",
  port: "MARGIN_PORT",
  customBaseUrl: "MARGIN_API_BASE_URL",
  customKey: "MARGIN_API_KEY",
  allowCustomLatex: "MARGIN_ALLOW_CUSTOM_LATEX",
  allowCustomCommands: "MARGIN_ALLOW_CUSTOM_COMMANDS",
};

/** Path of the project configuration: the new name, else the old one if only that exists. */
export function resolveConfigPath(repoRoot) {
  const current = path.join(repoRoot, CONFIG_NAME);
  if (existsSync(current)) return current;
  const predecessor = path.join(repoRoot, ".paper-pal.json");
  if (existsSync(predecessor)) return predecessor;
  const legacy = path.join(repoRoot, LEGACY_CONFIG_NAME);
  return existsSync(legacy) ? legacy : current;
}

/** State directory: the new name, unless only the old directory exists. */
export function resolveStateDir(repoRoot) {
  const current = path.join(repoRoot, STATE_DIR_NAME);
  if (existsSync(current)) return current;
  const predecessor = path.join(repoRoot, ".paper-pal");
  if (existsSync(predecessor)) return predecessor;
  const legacy = path.join(repoRoot, LEGACY_STATE_DIR_NAME);
  return existsSync(legacy) ? legacy : current;
}

/** Remembered-project pointer in the app checkout, or null when there is none. */
export function resolveLocalPointer(appRoot = APP_ROOT) {
  for (const name of [LOCAL_POINTER_NAME, "paper-pal.local.json", LEGACY_LOCAL_POINTER_NAME]) {
    const target = path.join(appRoot, name);
    if (existsSync(target)) return target;
  }
  return null;
}

/** Bind address. Only app-specific variables count; a generic HOST is ignored. */
export function hostFromEnvironment(env = process.env) {
  return env[ENV.host] || "127.0.0.1";
}

export function truthyEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

let cachedVersion = null;
export function appVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = String(JSON.parse(readFileSync(path.join(APP_ROOT, "package.json"), "utf8")).version || "0.0.0");
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}
