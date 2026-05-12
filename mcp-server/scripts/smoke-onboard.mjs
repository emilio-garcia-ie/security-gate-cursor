#!/usr/bin/env node
/**
 * Smoke: onboard script dry-run must succeed (Node check).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const onboard = path.join(REPO, "scripts", "onboard.mjs");

const r = spawnSync(process.execPath, [onboard, "--dry-run"], {
  encoding: "utf8",
  cwd: REPO,
  env: { ...process.env, SECURITY_GATE_LOCALE: "en" }
});

if (r.status !== 0) {
  console.error("[smoke-onboard] FAIL exit", r.status, r.stderr?.slice(0, 2000));
  process.exit(1);
}
if (!r.stdout.includes("Done") && !r.stdout.includes("next steps")) {
  console.error("[smoke-onboard] FAIL missing Done/next steps in stdout");
  console.error(r.stdout);
  process.exit(1);
}
console.error("[smoke-onboard] OK");
