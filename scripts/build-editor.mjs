import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["editor/main.jsx"],
  outfile: "public/editor/editor.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome120", "safari17"],
  minify: true,
  legalComments: "external",
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
// Bundled browser dependencies need their full notices even when production
// installations omit the development dependency tree used to build the island.
const packages = [...new Set(Object.keys(result.metafile.inputs).map((file) => file.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1]).filter(Boolean))].sort();
const notices = [];
for (const directory of packages) {
  const metadata = JSON.parse(await fs.readFile(path.join(root, directory, "package.json"), "utf8"));
  const names = (await fs.readdir(path.join(root, directory))).filter((name) => /^(?:licen[cs]e|copying)(?:\.|$)/i.test(name));
  if (!names.length && metadata.name === "@udecode/react-hotkeys") {
    notices.push(`${metadata.name} ${metadata.version}\n${await fs.readFile(path.join(root, "node_modules/platejs/LICENSE"), "utf8")}\n${await fs.readFile(path.join(root, "editor/licenses/react-hotkeys-hook.txt"), "utf8")}`);
    continue;
  }
  if (!names.length && ["jotai-x", "zustand-x"].includes(metadata.name)) {
    notices.push(`${metadata.name} ${metadata.version}\n${await fs.readFile(path.join(root, "editor/licenses/jotai-x.txt"), "utf8")}`);
    continue;
  }
  if (!names.length && metadata.name === "react-compiler-runtime") {
    notices.push(`${metadata.name} ${metadata.version}\n${await fs.readFile(path.join(root, "node_modules/react/LICENSE"), "utf8")}`);
    continue;
  }
  if (!names.length && ["slate", "slate-dom", "slate-history", "slate-react", "slate-hyperscript"].includes(metadata.name)) {
    notices.push(`${metadata.name} ${metadata.version}\n${await fs.readFile(path.join(root, "editor/licenses/slate.md"), "utf8")}`);
    continue;
  }
  if (!names.length) throw new Error(`Missing bundled license: ${metadata.name}`);
  for (const name of names) notices.push(`${metadata.name} ${metadata.version}\n${await fs.readFile(path.join(root, directory, name), "utf8")}`);
}
await fs.writeFile(path.join(root, "public/editor/THIRD-PARTY-LICENSES.txt"), notices.join("\n\n--------------------\n\n"));
