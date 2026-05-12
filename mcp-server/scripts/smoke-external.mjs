#!/usr/bin/env node
/**
 * Smoke test for shannon_pentest + llamafirewall_advisor wrappers.
 *
 * Validates ONLY safe paths (no pentest, no install, no Python imports of paid scanners):
 *   - shannon_pentest action="status" never throws and reports docker/node/credentials/target classification.
 *   - shannon_pentest action="install_plan" returns plan keys.
 *   - shannon_pentest action="pentest" with dryRun=true returns the planned command without spawning it.
 *   - llamafirewall_advisor action="status" reports python + agentic_signals + llamafirewall presence.
 *   - llamafirewall_advisor action="snippet" returns a non-empty Python snippet.
 *   - MCP tools/list contains both `shannon_pentest` and `llamafirewall_advisor`.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runShannonAction } from "../lib/shannon.mjs";
import { runLlamaFirewallAction } from "../lib/llamafirewall-advisor.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "index.mjs");
const REPO = path.resolve(__dirname, "..", "..");

function assertField(obj, keys, label) {
  for (const k of keys) {
    if (!(k in obj)) {
      console.error(`[smoke-external] FAIL — ${label} missing field "${k}"`);
      console.error(JSON.stringify(obj, null, 2));
      process.exit(1);
    }
  }
}

function unitShannon() {
  const status = runShannonAction({ workspaceRoot: REPO, action: "status" });
  assertField(status, ["ok", "action", "status"], "shannon status response");
  assertField(status.status, ["docker", "node", "npx", "credentials", "target", "ready"], "shannon status.status");
  console.log(JSON.stringify({
    kind: "unit",
    label: "shannon status detection",
    ready: status.status.ready,
    docker_available: status.status.docker.available,
    node_major: status.status.node.major,
    credentials_available: status.status.credentials.available
  }));

  const plan = runShannonAction({ workspaceRoot: REPO, action: "install_plan" });
  assertField(plan, ["ok", "install_plan"], "shannon install_plan");
  assertField(plan.install_plan, ["docker", "node", "credentials"], "shannon install_plan body");

  const dry = runShannonAction({
    workspaceRoot: REPO,
    action: "pentest",
    targetUrl: "http://localhost:23000",
    repoPath: REPO,
    dryRun: true
  });
  if (dry.ok && dry.dry_run) {
    console.log(JSON.stringify({ kind: "unit", label: "shannon pentest dryRun localhost", planned: dry.planned_command?.slice(0, 4) }));
  } else if (!dry.ok && dry.blocked_reason) {
    // Acceptable when host preflight fails (no docker / no credentials); but for dryRun=true
    // we still want a deterministic JSON payload describing the block.
    console.log(JSON.stringify({ kind: "unit", label: "shannon pentest dryRun blocked", blocked_reason: dry.blocked_reason }));
  } else {
    console.error("[smoke-external] FAIL — shannon dryRun returned unexpected shape");
    console.error(JSON.stringify(dry, null, 2));
    process.exit(1);
  }

  // Prod-like host must be rejected by target classifier.
  const prodGuard = runShannonAction({
    workspaceRoot: REPO,
    action: "pentest",
    targetUrl: "https://api.production.example.com",
    repoPath: REPO,
    dryRun: true
  });
  if (prodGuard.ok && prodGuard.dry_run) {
    console.error("[smoke-external] FAIL — shannon accepted a production-looking target");
    process.exit(1);
  }
  console.log(JSON.stringify({
    kind: "unit",
    label: "shannon target classifier rejects prod-like host",
    blocked_reason: prodGuard.blocked_reason
  }));
}

function unitLlamaFirewall() {
  const status = runLlamaFirewallAction({ workspaceRoot: REPO, action: "status" });
  assertField(status, ["ok", "action", "status"], "llamafirewall status response");
  assertField(status.status, ["python", "agentic_signals", "llamafirewall", "ready"], "llamafirewall status.status");
  console.log(JSON.stringify({
    kind: "unit",
    label: "llamafirewall status detection",
    python_available: status.status.python.available,
    python_major: status.status.python.major,
    agentic: status.status.agentic_signals.agentic,
    declared: status.status.llamafirewall.declared,
    importable: status.status.llamafirewall.importable
  }));

  const plan = runLlamaFirewallAction({ workspaceRoot: REPO, action: "install_plan" });
  assertField(plan, ["ok", "install_plan"], "llamafirewall install_plan");
  assertField(plan.install_plan, ["python", "venv", "credentials"], "llamafirewall install_plan body");

  const snip = runLlamaFirewallAction({ workspaceRoot: REPO, action: "snippet" });
  if (!snip.ok || !snip.snippet?.code || snip.snippet.code.length < 100) {
    console.error("[smoke-external] FAIL — llamafirewall snippet payload too small");
    process.exit(1);
  }
  console.log(JSON.stringify({ kind: "unit", label: "llamafirewall snippet present", code_length: snip.snippet.code.length }));
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
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "external-smoke", version: "0.0.1" } }
  });
  send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
  send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("smoke-external timeout")), 10000));
  try {
    await Promise.race([done, timeout]);
  } finally {
    child.kill("SIGTERM");
  }

  const list = responses.find((m) => m.id === 2);
  const names = list?.result?.tools?.map((t) => t.name) ?? [];
  const ok = names.includes("shannon_pentest") && names.includes("llamafirewall_advisor");
  console.log(JSON.stringify({ kind: "mcp", label: "tools/list contains shannon_pentest + llamafirewall_advisor", ok, names }));
  if (!ok) {
    console.error("[smoke-external] FAIL — missing one of shannon_pentest / llamafirewall_advisor in tools/list");
    process.exit(1);
  }
}

unitShannon();
unitLlamaFirewall();
await mcpListCheck();
console.error("[smoke-external] OK");
