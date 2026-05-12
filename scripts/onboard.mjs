#!/usr/bin/env node
/**
 * One-click local onboarding: verify Node, optional Docker/Semgrep, npm install in mcp-server/,
 * symlink ~/.cursor/plugins/local/security-gate → repo root.
 *
 * Usage:
 *   node scripts/onboard.mjs [--dry-run] [--skip-symlink] [--keys] [--keys-only] [--keys-profile=none|free|paid] [--locale=en|es]
 * Env: SECURITY_GATE_LOCALE=es (same as --locale=es)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MCP_DIR = path.join(REPO_ROOT, "mcp-server");
const LOCALES_DIR = path.join(REPO_ROOT, "scripts", "locales");

function parseArgs(argv) {
  const out = {
    dryRun: false,
    skipSymlink: false,
    keys: false,
    keysOnly: false,
    keysProfile: null,
    locale: (process.env.SECURITY_GATE_LOCALE || "en").toLowerCase().startsWith("es") ? "es" : "en"
  };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-symlink") out.skipSymlink = true;
    else if (a === "--keys") out.keys = true;
    else if (a === "--keys-only") out.keysOnly = true;
    else if (a.startsWith("--keys-profile=")) out.keysProfile = a.split("=", 2)[1];
    else if (a.startsWith("--locale=")) {
      const v = a.split("=", 2)[1]?.toLowerCase();
      out.locale = v === "es" ? "es" : "en";
    }
  }
  return out;
}

function loadStrings(locale) {
  const file = path.join(LOCALES_DIR, locale === "es" ? "onboard-es.json" : "onboard-en.json");
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function semverMajorMinor(v) {
  const m = String(v || "").match(/v?(\d+)\.(\d+)/);
  if (!m) return [0, 0];
  return [Number(m[1]), Number(m[2])];
}

function checkNode(S) {
  const v = process.version;
  const [maj, min] = semverMajorMinor(v);
  if (maj < 18 || (maj === 18 && min < 18)) {
    console.error(`${S.node_fail} ${v}`);
    process.exit(1);
  }
  console.log(`${S.node_ok} (${v})`);
}

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
    shell: false
  });
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

function checkDocker(S, args) {
  const p = which("docker");
  if (p) console.log(`${S.docker_ok} (${p})`);
  else console.log(S.docker_skip);
}

function checkSemgrep(S) {
  const p = which("semgrep");
  if (p) console.log(`${S.semgrep_ok} (${p})`);
  else console.log(S.semgrep_skip);
}

function runNpmInstall(args, S) {
  if (args.dryRun) {
    console.log(S.npm_dry);
    return;
  }
  console.log(S.npm_install);
  const r = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: MCP_DIR,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (r.status !== 0) {
    console.error("npm install in mcp-server/ failed.");
    process.exit(1);
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function linkPlugin(args, S) {
  if (args.skipSymlink) {
    console.log(S.symlink_skip);
    return;
  }
  if (args.dryRun) {
    console.log("[dry-run] Would symlink local Cursor plugin");
    return;
  }
  const pluginsBase = path.join(os.homedir(), ".cursor", "plugins", "local");
  const linkPath = path.join(pluginsBase, "security-gate");
  try {
    ensureDir(pluginsBase);
    try {
      fs.unlinkSync(linkPath);
    } catch {
      // ignore
    }
    if (process.platform === "win32") {
      fs.symlinkSync(REPO_ROOT, linkPath, "junction");
    } else {
      fs.symlinkSync(REPO_ROOT, linkPath, "dir");
    }
    console.log(`${S.symlink_ok}\n  ${linkPath} -> ${REPO_ROOT}`);
  } catch (e) {
    console.warn(S.symlink_manual);
    console.warn(String(e?.message || e));
  }
}

function printKeys(S, profile) {
  const p = profile || "none";
  console.log("\n---");
  console.log(S.keys_title);
  if (p === "free") console.log(S.keys_free);
  else if (p === "paid") console.log(S.keys_paid);
  else console.log(S.keys_none);
  console.log(S.keys_docs);
}

function printDone(S) {
  console.log("\n===", S.done_title, "===");
  console.log(S.step_open, REPO_ROOT);
  console.log(S.step_plugin);
  console.log(S.step_mcp);
  console.log(S.step_reload);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.locale !== "en" && args.locale !== "es") args.locale = "en";
  const S = loadStrings(args.locale);

  console.log("===", S.title, "===\n");
  checkNode(S);
  checkDocker(S, args);
  checkSemgrep(S);

  if (!args.keysOnly) {
    runNpmInstall(args, S);
    linkPlugin(args, S);
    printDone(S);
  }

  if (args.keys || args.keysOnly || args.keysProfile) {
    printKeys(S, args.keysProfile);
  }

  if (!args.keys && !args.keysOnly && !args.keysProfile && !args.dryRun) {
    console.log("\n(Run with --keys for optional API key hints, or --keys-profile=none|free|paid non-interactively.)");
  }
}

main();
