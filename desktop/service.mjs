// Electron's utility process supplies Node without relying on a system install.
import { fileURLToPath } from "node:url";
const server = new URL("../server.mjs", import.meta.url);
process.argv = [process.execPath, fileURLToPath(server), ...process.argv.slice(2)];
const log = console.log;
console.log = (...values) => {
  const match = values.join("\n").match(/is running at (http:\/\/127\.0\.0\.1:\d+)/);
  if (match) process.parentPort.postMessage({ type: "ready", url: match[1] });
  log(...values);
};
process.parentPort.on("message", ({ data }) => {
  if (data?.type === "shutdown") process.emit("SIGTERM");
});
await import(server.href);
