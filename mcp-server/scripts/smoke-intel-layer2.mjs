#!/usr/bin/env node
/**
 * Manual regression: calls `intel_refresh` then `layer2_brief` over MCP stdio
 * in sequence (brief must see refreshed cache). Requires outbound HTTPS.
 *
 * Workspace: defaults to `demo/cursor-webinar-sec/frontend` when that package.json
 * exists; otherwise repo root. Override with:
 *   SECURITY_GATE_INTEL_WORKSPACE=/absolute/path/to/project npm run smoke:intel
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "index.mjs");
const REPO = path.resolve(__dirname, "..", "..");

function pickWorkspace() {
  const override = process.env.SECURITY_GATE_INTEL_WORKSPACE?.trim();
  if (override) return path.resolve(override);
  const fe = path.join(REPO, "demo", "cursor-webinar-sec", "frontend", "package.json");
  if (fs.existsSync(fe)) return path.dirname(fe);
  return REPO;
}

function send(child, obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

async function main() {
  const workspaceRoot = pickWorkspace();
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
  const byId = new Map();
  let briefRequested = false;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));

  function maybeRequestBrief() {
    const intel = byId.get(10);
    if (!intel || (!intel.result && !intel.error) || briefRequested) return;
    briefRequested = true;
    send(child, {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "layer2_brief",
        arguments: { workspaceRoot, featureSummary: "smoke-intel-layer2 manual run" }
      }
    });
  }

  function check() {
    const intel = byId.get(10);
    const brief = byId.get(11);
    if (intel && (intel.result || intel.error)) maybeRequestBrief();
    if (brief && (brief.result || brief.error)) resolveDone();
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
        if (msg.id != null) {
          byId.set(msg.id, msg);
          check();
        }
      } catch {
        // ignore
      }
    }
  });

  send(child, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-intel-layer2", version: "0.0.1" }
    }
  });
  send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
  send(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });

  send(child, {
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: {
      name: "intel_refresh",
      arguments: { workspaceRoot, maxPackages: 12 }
    }
  });

  const timeoutMs = 120_000;
  await Promise.race([
    done,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs))
  ]).catch((e) => {
    console.error(String(e));
  });

  const intel = byId.get(10);
  const brief = byId.get(11);

  console.log(JSON.stringify({ workspaceRoot }, null, 2));
  console.log("--- intel_refresh ---");
  console.log(intel?.error ? JSON.stringify(intel.error, null, 2) : intel?.result?.content?.[0]?.text ?? "(no body)");
  console.log("--- layer2_brief (first 4000 chars) ---");
  const md = brief?.result?.content?.[0]?.text ?? "";
  console.log(md.slice(0, 4000));
  if (md.length > 4000) console.log(`\n... (${md.length} chars total)\n`);

  try {
    child.kill("SIGTERM");
  } catch {
    // noop
  }

  const intelOk = !!intel?.result && !intel?.error;
  const briefOk = !!brief?.result && !brief?.error;
  const intelPayload = intel?.result?.content?.[0]?.text;
  let parsed = null;
  try {
    parsed = JSON.parse(intelPayload || "null");
  } catch {
    parsed = null;
  }
  if (!intelOk || !briefOk) {
    console.error("[smoke-intel-layer2] FAIL — missing tool result");
    process.exit(1);
  }
  if (!parsed || typeof parsed.kevWritten !== "boolean") {
    console.error("[smoke-intel-layer2] FAIL — intel_refresh body not JSON");
    process.exit(1);
  }
  if (!md.includes("CISA KEV catalog")) {
    console.error("[smoke-intel-layer2] FAIL — layer2_brief missing KEV heading");
    process.exit(1);
  }
  console.error("[smoke-intel-layer2] OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
