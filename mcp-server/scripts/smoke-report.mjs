#!/usr/bin/env node
/**
 * Smoke: export-final-report writes a markdown file with expected sections.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const script = path.join(REPO, "scripts", "export-final-report.mjs");

const r = spawnSync(process.execPath, [script, "--workspace", REPO], {
  encoding: "utf8",
  cwd: REPO,
  maxBuffer: 20 * 1024 * 1024
});

if (r.status !== 0) {
  console.error("[smoke-report] FAIL", r.stderr);
  process.exit(1);
}
let out;
try {
  out = JSON.parse(r.stdout.trim().split("\n").pop() || "{}");
} catch {
  console.error("[smoke-report] FAIL parse stdout", r.stdout);
  process.exit(1);
}
if (!out.written || !fs.existsSync(out.written)) {
  console.error("[smoke-report] FAIL missing file", out);
  process.exit(1);
}
const md = fs.readFileSync(out.written, "utf8");
for (const needle of ["## Handbrake", "## Semgrep", "## Executive summary"]) {
  if (!md.includes(needle)) {
    console.error("[smoke-report] FAIL missing section:", needle);
    process.exit(1);
  }
}
console.error("[smoke-report] OK", out.written);
