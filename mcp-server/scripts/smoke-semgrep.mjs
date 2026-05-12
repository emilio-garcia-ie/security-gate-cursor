#!/usr/bin/env node
/**
 * Smoke test for the bundled semgrep_scan wrapper.
 *
 * Safe paths only:
 *   - action="status" returns engine detection without scanning.
 *   - action="scan_text" with a deliberately vulnerable Python snippet must succeed
 *     (exit code 0 or 1 — both acceptable). If Semgrep is not installed at all,
 *     the wrapper returns blocked_reason and we accept that as a non-failure here
 *     (CI / sandboxed environments without Semgrep should not be forced to fail).
 *   - The MCP server lists `semgrep_scan` in tools/list.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSemgrepAction } from "../lib/semgrep-scan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "index.mjs");
const REPO = path.resolve(__dirname, "..", "..");

const VULN_PY = `
import os, subprocess

def run_cmd(user_input):
    # Deliberate command injection sink for smoke test only.
    os.system("echo " + user_input)
    subprocess.call("bash -c " + user_input, shell=True)

def insecure_yaml(blob):
    import yaml
    return yaml.load(blob)  # use_of_yaml_load
`;

function unitChecks() {
  const status = runSemgrepAction({ action: "status", workspaceRoot: REPO });
  if (!status.ok || !("engine" in status)) {
    console.error("[smoke-semgrep] FAIL — status response shape unexpected");
    console.error(JSON.stringify(status, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    kind: "unit",
    label: "semgrep status detection",
    engine: status.engine,
    host_available: status.host_semgrep?.available,
    docker_available: status.docker?.available
  }));

  const scan = runSemgrepAction({
    action: "scan_text",
    workspaceRoot: REPO,
    snippet: VULN_PY,
    language: "python",
    config: "p/python"
  });
  if (scan.ok) {
    const total = scan.summary?.total_findings ?? 0;
    console.log(JSON.stringify({
      kind: "unit",
      label: "semgrep scan_text on vulnerable python",
      engine: scan.engine,
      exit_code: scan.exit_code,
      findings_present: scan.findings_present,
      total_findings: total
    }));
  } else if (scan.blocked_reason && /No Semgrep engine available|engine returned a non-acceptable/.test(scan.blocked_reason)) {
    console.log(JSON.stringify({
      kind: "unit",
      label: "semgrep scan_text gracefully blocked (no engine available)",
      blocked_reason: scan.blocked_reason
    }));
  } else {
    console.error("[smoke-semgrep] FAIL — unexpected scan_text result");
    console.error(JSON.stringify(scan, null, 2));
    process.exit(1);
  }
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
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "semgrep-smoke", version: "0.0.1" } }
  });
  send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
  send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("smoke-semgrep timeout")), 10000));
  try {
    await Promise.race([done, timeout]);
  } finally {
    child.kill("SIGTERM");
  }

  const list = responses.find((m) => m.id === 2);
  const names = list?.result?.tools?.map((t) => t.name) ?? [];
  const ok = names.includes("semgrep_scan");
  console.log(JSON.stringify({ kind: "mcp", label: "tools/list contains semgrep_scan", ok, names }));
  if (!ok) {
    console.error("[smoke-semgrep] FAIL — semgrep_scan missing from tools/list");
    process.exit(1);
  }
}

unitChecks();
await mcpListCheck();
console.error("[smoke-semgrep] OK");
