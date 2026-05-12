#!/usr/bin/env node
/**
 * Auxiliary smoke tests covering:
 *   - `looksLikeProdDbName` regressions for embedded "prod" substrings
 *     (e.g. `myappprod`) and negative controls (`staging-db`, `delivery-db`).
 *   - hooks/session-hint.mjs runtime behavior: must exit 0, emit a neutral
 *     JSON object on stdout, and never crash on empty stdin.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "index.mjs");
const REPO = path.resolve(__dirname, "..", "..");
const HOOK = path.resolve(REPO, "hooks", "session-hint.mjs");

function runMcpDbCase(label, dbUrl, expectedAllowed) {
  return new Promise((resolve) => {
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
    env.DATABASE_URL = dbUrl;
    const child = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"], env, cwd: REPO });
    let buf = "";
    const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          if (m.id === 3) {
            const txt = m.result?.content?.[0]?.text ?? "";
            let parsed = null;
            try {
              parsed = JSON.parse(txt);
            } catch {
              parsed = null;
            }
            const got = parsed?.dynamic_allowed;
            const ok = got === expectedAllowed;
            console.log(JSON.stringify({
              kind: "dbname",
              label,
              dbUrl,
              expected: expectedAllowed,
              got,
              ok,
              reasons: parsed?.reasons ?? []
            }));
            child.kill("SIGTERM");
            resolve(ok);
          }
        } catch {
          // ignore
        }
      }
    });
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "aux", version: "0" } }
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "handbrake_scan", arguments: { workspaceRoot: REPO } }
    });
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // noop
      }
      resolve(false);
    }, 6000);
  });
}

function runHookCase(label, stdinPayload) {
  return new Promise((resolve) => {
    const child = spawn("node", [HOOK], { stdio: ["pipe", "pipe", "pipe"], cwd: REPO });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => {
      out += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      err += c.toString("utf8");
    });
    child.on("exit", (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(out.trim() || "{}");
      } catch {
        parsed = null;
      }
      const ok =
        code === 0 &&
        parsed !== null &&
        typeof parsed === "object" &&
        !Object.prototype.hasOwnProperty.call(parsed, "permission");
      console.log(JSON.stringify({
        kind: "hook",
        label,
        exitCode: code,
        ok,
        stdoutLen: out.length,
        parsedKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : null,
        stderrIncludesHint: err.includes("[security-gate]")
      }));
      resolve(ok);
    });
    if (typeof stdinPayload === "string") {
      child.stdin.write(stdinPayload);
    } else {
      child.stdin.write(JSON.stringify(stdinPayload));
    }
    child.stdin.end();
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // noop
      }
      resolve(false);
    }, 5000);
  });
}

const dbCases = [
  ["host=localhost name=myappprod blocked (embedded prod)", "postgresql://u:p@localhost:5432/myappprod", false],
  ["host=localhost name=prod-db blocked", "postgresql://u:p@localhost:5432/prod-db", false],
  ["host=localhost name=staging-db allowed", "postgresql://u:p@localhost:5432/staging-db", true],
  ["host=localhost name=delivery-db allowed (must NOT match 'live')", "postgresql://u:p@localhost:5432/delivery-db", true],
  ["host=localhost name=mainDB blocked", "postgresql://u:p@localhost:5432/mainDB", false],
  ["host=localhost name=app_prod_v2 blocked", "postgresql://u:p@localhost:5432/app_prod_v2", false]
];

const results = [];
for (const [label, url, expected] of dbCases) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await runMcpDbCase(label, url, expected));
}
// eslint-disable-next-line no-await-in-loop
results.push(await runHookCase("session-hint empty stdin", ""));
// eslint-disable-next-line no-await-in-loop
results.push(await runHookCase("session-hint sessionStart-like payload", { event: "sessionStart" }));

const failed = results.filter((ok) => !ok).length;
if (failed) {
  console.error(`[smoke-aux] FAIL — ${failed}/${results.length} case(s) failed`);
  process.exit(1);
}
console.error("[smoke-aux] OK");
