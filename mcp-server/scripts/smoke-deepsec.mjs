#!/usr/bin/env node
/**
 * Smoke test for the DeepSec wrapper.
 *
 * Validates ONLY safe paths (no network, no install, no scan):
 *   - action="status" never throws and includes node/pnpm/scaffold/credentials fields.
 *   - action="install_plan" returns the expected plan keys.
 *   - The MCP server exposes `deepsec_review` in tools/list.
 *
 * The smoke test must not fail when Node 22 / pnpm / credentials are missing — it only
 * asserts the wrapper reports those gaps cleanly.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDeepSecAction } from "../lib/deepsec.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "index.mjs");
const REPO = path.resolve(__dirname, "..", "..");

function assertField(obj, keys, label) {
  for (const k of keys) {
    if (!(k in obj)) {
      console.error(`[smoke-deepsec] FAIL — ${label} missing field "${k}"`);
      console.error(JSON.stringify(obj, null, 2));
      process.exit(1);
    }
  }
}

async function unitChecks() {
  const status = runDeepSecAction({ workspaceRoot: REPO, action: "status" });
  assertField(status, ["ok", "action", "status"], "status response");
  assertField(status.status, ["node", "pnpm", "npx", "scaffold", "credentials", "ready"], "status.status block");
  console.log(JSON.stringify({
    kind: "unit",
    label: "deepsec status detection",
    ready: status.status.ready,
    node_major: status.status.node.major,
    pnpm_available: status.status.pnpm.available,
    scaffold_exists: status.status.scaffold.exists,
    credentials_available: status.status.credentials.available
  }));

  const plan = runDeepSecAction({ workspaceRoot: REPO, action: "install_plan" });
  assertField(plan, ["ok", "action", "install_plan"], "install_plan response");
  assertField(plan.install_plan, ["node", "pnpm", "credentials"], "install_plan.install_plan");
  console.log(JSON.stringify({
    kind: "unit",
    label: "deepsec install plan keys",
    has_node: !!plan.install_plan.node,
    has_pnpm: !!plan.install_plan.pnpm,
    cred_options: plan.install_plan.credentials.options.length
  }));
}

function send(child, obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

async function mcpListCheck() {
  const env = { ...process.env };
  for (const k of ["NODE_ENV", "ENV", "RAILS_ENV", "PRODUCTION", "DATABASE_URL", "DB_URL", "MYSQL_URL", "POSTGRES_URL"]) {
    delete env[k];
  }
  const child = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"], env, cwd: REPO });
  let buf = "";
  const responses = [];
  let resolveList;
  const done = new Promise((r) => (resolveList = r));

  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        responses.push(msg);
        if (responses.find((m) => m.id === 2)) resolveList();
      } catch {
        // ignore
      }
    }
  });
  child.stderr.on("data", () => {});

  send(child, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "deepsec-smoke", version: "0.0.1" } }
  });
  send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
  send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("smoke-deepsec timeout")), 10000));
  try {
    await Promise.race([done, timeout]);
  } finally {
    child.kill("SIGTERM");
  }

  const list = responses.find((m) => m.id === 2);
  const names = list?.result?.tools?.map((t) => t.name) ?? [];
  const ok = names.includes("deepsec_review");
  console.log(JSON.stringify({ kind: "mcp", label: "tools/list contains deepsec_review", ok, names }));
  if (!ok) {
    console.error("[smoke-deepsec] FAIL — deepsec_review missing from tools/list");
    process.exit(1);
  }
}

await unitChecks();
await mcpListCheck();
console.error("[smoke-deepsec] OK");
