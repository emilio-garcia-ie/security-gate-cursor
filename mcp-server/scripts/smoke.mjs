#!/usr/bin/env node
/**
 * Minimal MCP stdio smoke test for the Security Gate MCP server.
 *
 * Spawns `node ../index.mjs`, performs the initialize / notifications/initialized
 * handshake, then calls:
 *   - tools/list
 *   - tools/call handbrake_scan
 *   - tools/call lab_bootstrap (action=install_plan; no Docker required)
 *
 * Exits with a non-zero status if the handshake fails, no tools are returned,
 * or handbrake_scan does not succeed. Intended for local regression checks.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "index.mjs");
const REPO = path.resolve(__dirname, "..", "..");

function send(child, obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

async function main() {
  // Strip prod-like env keys so the smoke test is deterministic on dev boxes.
  const env = { ...process.env };
  for (const k of [
    "NODE_ENV",
    "ENV",
    "RAILS_ENV",
    "PRODUCTION",
    "DATABASE_URL",
    "DB_URL",
    "MYSQL_URL",
    "POSTGRES_URL"
  ]) {
    delete env[k];
  }

  const child = spawn("node", [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env,
    cwd: REPO
  });

  let buf = "";
  const responses = [];
  let resolveAll;
  const allDone = new Promise((r) => (resolveAll = r));

  function tryResolveAll() {
    const r3 = responses.find((m) => m.id === 3);
    const r4 = responses.find((m) => m.id === 4);
    if (r3 && r4 && (r3.result || r3.error) && (r4.result || r4.error)) resolveAll();
  }

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
        tryResolveAll();
      } catch {
        // ignore non-JSON noise on stdout
      }
    }
  });

  child.stderr.on("data", () => {
    // Intentionally silent: the MCP server writes JSON-RPC on stdout; stderr
    // is reserved for human diagnostics that should not gate the smoke test.
  });

  // initialize
  send(child, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "security-gate-smoke", version: "0.0.1" }
    }
  });

  // initialized notification (no id)
  send(child, { jsonrpc: "2.0", method: "notifications/initialized" });

  // tools/list
  send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });

  // tools/call handbrake_scan
  send(child, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "handbrake_scan",
      arguments: { workspaceRoot: REPO }
    }
  });

  // tools/call lab_bootstrap (install_plan avoids docker compose)
  send(child, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "lab_bootstrap",
      arguments: { action: "install_plan" }
    }
  });

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("smoke timeout")), 12000));
  try {
    await Promise.race([allDone, timeout]);
  } catch (e) {
    console.error(`[smoke] timeout: ${e.message}`);
  }

  const initResp = responses.find((m) => m.id === 1);
  const listResp = responses.find((m) => m.id === 2);
  const callResp = responses.find((m) => m.id === 3);
  const labResp = responses.find((m) => m.id === 4);
  let labPayload = null;
  try {
    labPayload = JSON.parse(labResp?.result?.content?.[0]?.text || "null");
  } catch {
    labPayload = null;
  }

  const toolNames = listResp?.result?.tools?.map((t) => t.name) ?? [];
  const summary = {
    initOk: !!initResp?.result,
    initError: initResp?.error?.message ?? null,
    toolCount: toolNames.length,
    toolNames,
    callOk: !!callResp?.result,
    callError: callResp?.error?.message ?? null,
    callTextLen: callResp?.result?.content?.[0]?.text?.length ?? 0,
    labCallOk: !!labResp?.result,
    labCallError: labResp?.error?.message ?? null,
    labAction: labPayload?.action ?? null
  };
  console.log(JSON.stringify(summary, null, 2));

  child.kill("SIGTERM");

  const expectedTools = [
    "handbrake_scan",
    "project_profile",
    "intel_refresh",
    "layer2_brief",
    "lab_bootstrap",
    "deepsec_review",
    "shannon_pentest",
    "llamafirewall_advisor",
    "semgrep_scan"
  ];
  const missing = expectedTools.filter((n) => !toolNames.includes(n));
  if (!summary.initOk || missing.length || !summary.callOk || !summary.labCallOk || summary.labAction !== "install_plan") {
    console.error(
      `[smoke] FAIL — missing tools: ${missing.join(", ") || "(none)"}; init=${summary.initOk}; call=${summary.callOk}; lab=${summary.labCallOk}; labAction=${summary.labAction}`
    );
    process.exit(1);
  }
  console.error("[smoke] OK");
}

main().catch((e) => {
  console.error(`[smoke] uncaught: ${e.message}`);
  process.exit(1);
});
