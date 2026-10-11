import { inflateRawSync } from "node:zlib";
import { hashText, reviewMarkdown, safeReviewPath, validateReviewState } from "./review-store.mjs";

export const PACKAGE_LIMIT = 32 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k += 1) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const invalid = (message = "The review package is damaged or unsupported.") => { const error = new Error(message); error.status = 400; throw error; };

// Stored ZIP entries need no runtime dependency and are readable by ordinary
// archive tools. Import also accepts conventional DEFLATE, with an output cap.
export function zipFiles(files) {
  if (files.size > 5000) invalid("The review package contains too many files.");
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const [name, content] of files) {
    const filename = Buffer.from(safeReviewPath(name));
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    parts.push(header, filename, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    header.copy(entry, 8, 6, 28);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, filename);
    offset += header.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  const result = Buffer.concat([...parts, central, end]);
  if (result.length > PACKAGE_LIMIT) invalid("The review package exceeds 32 MiB; export a smaller project.");
  return result;
}

export function unzipFiles(bytes) {
  if (bytes.length > PACKAGE_LIMIT || bytes.length < 22) invalid();
  try {
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
    if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) invalid();
    const count = bytes.readUInt16LE(end + 10);
    if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || count !== bytes.readUInt16LE(end + 8) || count > 5000) invalid();
    let cursor = bytes.readUInt32LE(end + 16);
    if (cursor + bytes.readUInt32LE(end + 12) !== end) invalid();
    const files = new Map();
    const folded = new Set();
    let total = 0;
    for (let i = 0; i < count; i += 1) {
      if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) invalid();
      const flags = bytes.readUInt16LE(cursor + 8);
      const method = bytes.readUInt16LE(cursor + 10);
      const checksum = bytes.readUInt32LE(cursor + 16);
      const size = bytes.readUInt32LE(cursor + 20);
      const expanded = bytes.readUInt32LE(cursor + 24);
      const nameLength = bytes.readUInt16LE(cursor + 28);
      const extra = bytes.readUInt16LE(cursor + 30);
      const comment = bytes.readUInt16LE(cursor + 32);
      const at = bytes.readUInt32LE(cursor + 42);
      const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      safeReviewPath(name);
      if (flags & 1 || ![0, 8].includes(method) || folded.has(name.toLowerCase()) || at + 30 > cursor || bytes.readUInt32LE(at) !== 0x04034b50) invalid();
      folded.add(name.toLowerCase());
      total += expanded;
      if (total > PACKAGE_LIMIT) invalid("The expanded review package exceeds 32 MiB.");
      const localNameLength = bytes.readUInt16LE(at + 26);
      if (bytes.subarray(at + 30, at + 30 + localNameLength).toString("utf8") !== name) invalid();
      const start = at + 30 + localNameLength + bytes.readUInt16LE(at + 28);
      if (start + size > cursor) invalid();
      const compressed = bytes.subarray(start, start + size);
      const data = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, expanded) });
      if (data.length !== expanded || crc32(data) !== checksum) invalid();
      files.set(name, data);
      cursor += 46 + nameLength + extra + comment;
    }
    if (cursor !== end) invalid();
    return files;
  } catch (error) {
    if (error.status) throw error;
    invalid();
  }
}

export function exportReviewPackage(state, assets = new Map()) {
  validateReviewState(state);
  state = { ...state, format: "margin-review" };
  const files = new Map([
    ["REVIEW.md", reviewMarkdown(state)],
    ["review/state.json", JSON.stringify(state, null, 2)],
    ["review/comments.json", JSON.stringify(state.comments, null, 2)],
    ["review/changes.json", JSON.stringify(state.events.filter((item) => item.resultRevision), null, 2)],
    ["review/history.jsonl", state.events.map((item) => JSON.stringify(item)).join("\n") + "\n"],
  ]);
  for (const document of state.documents) {
    files.set(`documents/original/${document.path}`, document.revisions.find((item) => item.id === document.baselineId).source);
    files.set(`documents/current/${document.path}`, document.revisions.at(-1).source);
  }
  for (const [name, bytes] of assets) files.set(`documents/current/${safeReviewPath(name)}`, bytes);
  const manifest = { format: "margin-review-package", version: 1, projectId: state.projectId, createdAt: new Date().toISOString(), offsetEncoding: "utf-16", complete: true, files: [...files].map(([name, data]) => ({ path: name, sha256: hashText(data) })) };
  files.set("manifest.json", JSON.stringify(manifest, null, 2));
  return zipFiles(files);
}

export function importReviewPackage(bytes) {
  const files = unzipFiles(bytes);
  let manifest;
  let state;
  try { manifest = JSON.parse(files.get("manifest.json")); state = JSON.parse(files.get("review/state.json")); }
  catch { invalid(); }
  if (!["margin-review-package", "paper-pal-review-package"].includes(manifest?.format) || manifest.version !== 1 || manifest.complete !== true || manifest.offsetEncoding !== "utf-16" || !Array.isArray(manifest.files) || manifest.files.length !== files.size - 1) invalid();
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || seen.has(entry.path) || entry.path === "manifest.json" || !files.has(entry.path) || hashText(files.get(entry.path)) !== entry.sha256) invalid("A file in the review package failed its integrity check.");
    seen.add(entry.path);
  }
  validateReviewState(state);
  if (manifest.projectId !== state.projectId) invalid();
  for (const document of state.documents) {
    const original = document.revisions.find((item) => item.id === document.baselineId).source;
    if (!files.get(`documents/original/${document.path}`)?.equals(Buffer.from(original)) || !files.get(`documents/current/${document.path}`)?.equals(Buffer.from(document.revisions.at(-1).source))) invalid("The source files do not match the review history.");
  }
  const documents = new Set(state.documents.map((item) => item.path));
  const assets = new Map();
  for (const [name, data] of files) {
    if (!name.startsWith("documents/current/")) continue;
    const relative = name.slice("documents/current/".length);
    if (documents.has(relative)) continue;
    if (!/\.(bib|sty|cls|png|jpe?g|gif|webp|svg|pdf)$/i.test(relative)) invalid("The review package contains an unsupported resource.");
    assets.set(relative, data);
  }
  return { state, assets };
}
