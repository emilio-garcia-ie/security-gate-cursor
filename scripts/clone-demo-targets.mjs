#!/usr/bin/env node
/**
 * Cross-platform clone of vulnerable demo repos into demo/.
 * Works on macOS, Windows, and Linux (requires git on PATH).
 * Prefer this over clone-demo-targets.sh on Windows without Git Bash.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEMO = path.join(ROOT, "demo");

const REPOS = [
  { name: "cursor-webinar-sec", url: "https://github.com/mascarock/cursor-webinar-sec.git" },
  { name: "damn-vulnerable-llm-agent", url: "https://github.com/ReversecLabs/damn-vulnerable-llm-agent.git" }
];

function gitOnPath() {
  const r = spawnSync("git", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

function cloneOne(url, name) {
  const target = path.join(DEMO, name);
  if (fs.existsSync(target)) {
    console.log(`demo/${name} already exists — skip`);
    return true;
  }
  const r = spawnSync("git", ["clone", url, target], {
    stdio: "inherit",
    cwd: DEMO,
    shell: false
  });
  if (r.status !== 0) {
    console.error(`git clone failed for ${name} (exit ${r.status ?? "unknown"})`);
    return false;
  }
  return true;
}

function main() {
  if (!gitOnPath()) {
    console.error("git is not available on PATH. Install Git for Windows / Xcode CLI tools / git package, then retry.");
    process.exit(1);
  }
  fs.mkdirSync(DEMO, { recursive: true });
  let ok = true;
  for (const { name, url } of REPOS) {
    if (!cloneOne(url, name)) ok = false;
  }
  if (ok) {
    console.log("Done. From the repo root run: docker compose up -d webapp-target");
  }
  process.exit(ok ? 0 : 1);
}

main();
