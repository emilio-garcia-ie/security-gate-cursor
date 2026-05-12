#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const r = spawnSync("docker", ["compose", "down"], {
  cwd: ROOT,
  encoding: "utf8",
  shell: false,
  stdio: "inherit"
});
process.exit(r.status ?? 1);
