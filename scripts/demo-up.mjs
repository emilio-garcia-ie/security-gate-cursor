#!/usr/bin/env node
/**
 * Start demo Docker targets with two free host ports (avoids "port already allocated"
 * for users who are not comfortable picking ports / env vars).
 *
 * Usage (from repo root): npm run demo:up
 * Tear down: npm run demo:down
 */
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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

async function main() {
  const webPort = await pickFreePort();
  let agentPort = await pickFreePort();
  let guard = 0;
  while (agentPort === webPort && guard++ < 10) {
    agentPort = await pickFreePort();
  }
  if (agentPort === webPort) {
    console.error("Could not allocate two distinct free ports.");
    process.exit(1);
  }

  const env = {
    SECURITY_GATE_WEBAPP_PORT: String(webPort),
    SECURITY_GATE_AGENT_PORT: String(agentPort)
  };

  console.log(`Using free host ports: webapp → ${webPort}, agent → ${agentPort}\n`);

  const up = runDocker(["compose", "up", "-d", "webapp-target", "agent-target"], env);
  if (up.status !== 0) {
    process.exit(up.status ?? 1);
  }

  console.log("\n--- Open in your browser ---");
  console.log(`  Web app:  http://127.0.0.1:${webPort}/`);
  console.log(`  Agent UI: http://127.0.0.1:${agentPort}/`);
  console.log("\nStop: npm run demo:down\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
