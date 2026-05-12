#!/usr/bin/env node
/**
 * Stop demo containers. Pass a target to stop only one:
 *   npm run demo:down              # stop everything (docker compose down)
 *   npm run demo:down -- webapp    # stop only webapp-target
 *   npm run demo:down -- agent     # stop only agent-target
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVICE_FOR = {
  webapp: "webapp-target",
  agent: "agent-target"
};

const target = (process.argv[2] || "").trim().toLowerCase();

let args;
if (!target) {
  args = ["compose", "down"];
} else if (SERVICE_FOR[target]) {
  args = ["compose", "stop", SERVICE_FOR[target]];
} else {
  console.error(
    `Unknown demo target "${target}". Use one of: ${Object.keys(SERVICE_FOR).join(", ")} (or omit to stop all).`
  );
  process.exit(2);
}

const r = spawnSync("docker", args, {
  cwd: ROOT,
  encoding: "utf8",
  shell: false,
  stdio: "inherit"
});
process.exit(r.status ?? 1);
