#!/usr/bin/env node
// A stdio client adapter to the running workspace: never opens source files.
import { once } from "node:events";

let endpoint;
try {
  endpoint = new URL(process.env.MARGIN_MCP_URL || "http://127.0.0.1:4317/mcp");
  if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) || endpoint.pathname !== "/mcp" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
  if (!process.env.MARGIN_MCP_TOKEN) throw new Error();
} catch {
  console.error("Set MARGIN_MCP_URL to the running loopback /mcp endpoint and MARGIN_MCP_TOKEN to its connection token.");
  process.exit(2);
}
async function send(line) {
  let message;
  let reply;
  try { message = JSON.parse(line); }
  catch { reply = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON." } }; }
  if (!reply) {
    try {
      const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(60000), headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-Margin": "1", Authorization: `Bearer ${process.env.MARGIN_MCP_TOKEN}`, "X-Margin-Desktop-Token": process.env.MARGIN_MCP_TOKEN }, body: JSON.stringify(message) });
      if (!response.ok) throw new Error();
      if (response.status !== 202) reply = await response.json();
    } catch {
      if (message && Object.hasOwn(message, "id")) reply = { jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "Margin is unavailable or the connection expired. Reopen the workspace and refresh the MCP configuration. Do not blindly retry a mutation; read comments first." } };
    }
  }
  if (reply && !process.stdout.write(`${JSON.stringify(reply)}\n`)) await once(process.stdout, "drain");
}
// Bound individual input lines; readline alone buffers unlimited untrusted input.
process.stdin.setEncoding("utf8");
let pending = "";
for await (const chunk of process.stdin) {
  pending += chunk;
  let end;
  while ((end = pending.indexOf("\n")) !== -1) {
    if (end > 2000000) process.exit(2);
    const line = pending.slice(0, end).trim();
    pending = pending.slice(end + 1);
    if (line) await send(line);
  }
  if (pending.length > 2000000) process.exit(2);
}
if (pending.trim()) await send(pending);
