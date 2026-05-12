#!/usr/bin/env node
/**
 * Production-handbrake smoke matrix.
 *
 * For each environment profile, spawns the MCP server, performs the MCP
 * handshake, calls `handbrake_scan`, and asserts the expected
 * `dynamic_allowed` outcome. Used as a regression test for the production
 * safety handbrake heuristics.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "..", "index.mjs");
const REPO = path.resolve(__dirname, "..", "..");

function runCase(label, envPatch, expected) {
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
    Object.assign(env, envPatch);

    const child = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"], env, cwd: REPO });
    let buf = "";
    let result = null;
    const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");

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
            try {
              result = JSON.parse(txt);
            } catch {
              result = null;
            }
            const ok = result?.dynamic_allowed === expected;
            console.log(JSON.stringify({
              label,
              expected_dynamic_allowed: expected,
              got_dynamic_allowed: result?.dynamic_allowed ?? null,
              ok,
              reasons: result?.reasons ?? []
            }));
            child.kill("SIGTERM");
            resolve(ok);
          }
        } catch {
          // ignore non-JSON
        }
      }
    });

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-prod", version: "0" }
      }
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

const cases = [
  ["clean (no prod signals)", {}, true],
  ["NODE_ENV=production blocks", { NODE_ENV: "production" }, false],
  ["ENV=prod blocks", { ENV: "prod" }, false],
  ["PRODUCTION=true blocks", { PRODUCTION: "true" }, false],
  ["DATABASE_URL non-local + prod-name blocks", { DATABASE_URL: "postgresql://u:p@db.example.com:5432/myappprod" }, false],
  ["DATABASE_URL localhost allows", { DATABASE_URL: "postgresql://u:p@localhost:5432/dev_db" }, true]
];

const results = [];
for (const [label, env, expected] of cases) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await runCase(label, env, expected));
}

const failed = results.filter((ok) => !ok).length;
if (failed) {
  console.error(`[smoke-prod] FAIL — ${failed}/${results.length} case(s) failed`);
  process.exit(1);
}
console.error("[smoke-prod] OK");
