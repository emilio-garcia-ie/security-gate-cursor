#!/usr/bin/env node
/**
 * Start ONE demo Docker target at a time on a free host port, then print its URL.
 *
 * Usage (from repo root):
 *   npm run demo:webapp   # start only webapp-target
 *   npm run demo:agent    # start only agent-target
 *   npm run demo:up       # backward-compatible alias for `demo:webapp`
 *
 * Tear down a single target:
 *   npm run demo:down -- webapp
 *   npm run demo:down -- agent
 *   npm run demo:down            # stop all demo services
 */
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TARGETS = {
  webapp: {
    service: "webapp-target",
    envVar: "SECURITY_GATE_WEBAPP_PORT",
    label: "Web app"
  },
  agent: {
    service: "agent-target",
    envVar: "SECURITY_GATE_AGENT_PORT",
    label: "Agent UI"
  }
};

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      try {
        const addr = s.address();
        const p = typeof addr === "object" && addr ? addr.port : null;
        s.close((err) => {
          if (err) reject(err);
          else if (p) resolve(p);
          else reject(new Error("Could not resolve ephemeral port"));
        });
      } catch (e) {
        try {
          s.close();
        } catch {
          // ignore
        }
        reject(e);
      }
    });
  });
}

function runDocker(args, extraEnv) {
  return spawnSync("docker", args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "inherit", "inherit"]
  });
}

function parseTarget(argv) {
  const fromEnv = process.env.DEMO_TARGET?.trim().toLowerCase();
  const fromArg = (argv[2] || "").trim().toLowerCase();
  const t = fromArg || fromEnv || "webapp";
  if (!TARGETS[t]) {
    console.error(
      `Unknown demo target "${t}". Use one of: ${Object.keys(TARGETS).join(", ")}.`
    );
    process.exit(2);
  }
  return t;
}

async function main() {
  const key = parseTarget(process.argv);
  const target = TARGETS[key];

  const port = await pickFreePort();
  const env = { [target.envVar]: String(port) };

  console.log(
    `Starting ONLY ${target.service} on free host port ${port}\n` +
      `(env: ${target.envVar}=${port})\n`
  );

  const up = runDocker(["compose", "up", "-d", target.service], env);
  if (up.status !== 0) {
    process.exit(up.status ?? 1);
  }

  console.log("\n--- Open in your browser ---");
  console.log(`  ${target.label}: http://127.0.0.1:${port}/`);
  console.log(`\nStop only this target: npm run demo:down -- ${key}`);
  console.log("Stop everything:       npm run demo:down\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
