#!/usr/bin/env node
/**
 * Small benchmark: raw `semgrep scan` vs Security Gate `runSemgrepAction` + handbrake snapshot.
 * Default scan path: <repo>/mcp-server (bounded, fast).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHandbrakeScan } from "../mcp-server/lib/handbrake.mjs";
import { runSemgrepAction } from "../mcp-server/lib/semgrep-scan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const CONFIG = "p/ci";

function timeMs(fn) {
  const t0 = performance.now();
  const r = fn();
  return { ms: Math.round(performance.now() - t0), result: r };
}

async function main() {
  const target = path.join(REPO, "mcp-server");
  if (!fs.existsSync(target)) {
    console.error("mcp-server/ not found; run from repo root.");
    process.exit(1);
  }

  let baseline;
  try {
    baseline = timeMs(() =>
      spawnSync("semgrep", ["scan", "--config", CONFIG, "--metrics=off", "--quiet", "--json", target], {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        shell: false
      })
    );
  } catch (e) {
    console.error("Host `semgrep` not available; install Semgrep or use Docker. " + String(e?.message || e));
    process.exit(1);
  }
  if (baseline.result.error || (baseline.result.status !== 0 && baseline.result.status !== 1)) {
    console.error("Baseline semgrep failed:", baseline.result.stderr?.slice(0, 500) || baseline.result.error);
    process.exit(1);
  }

  const wrapped = timeMs(() =>
    runSemgrepAction({
      action: "scan_path",
      workspaceRoot: REPO,
      target_path: target,
      config: CONFIG
    })
  );

  const hb = await runHandbrakeScan(REPO);

  const lines = [
    "# Security Gate demo benchmark",
    "",
    "| Step | Wall time (ms) | Notes |",
    "|------|----------------|-------|",
    `| Raw \`semgrep scan\` (host) | ${baseline.ms} | exit ${baseline.result.status} |`,
    `| \`semgrep_scan\` MCP wrapper | ${wrapped.ms} | engine ${wrapped.result.engine}; elapsed_ms ${wrapped.result.elapsed_ms ?? "n/a"} |`,
    `| \`handbrake_scan\` (snapshot) | — | dynamic_allowed=${hb.dynamic_allowed} |`,
    "",
    "The wrapper adds JSON parsing, engine resolution, and safety limits — wall time is comparable or slightly higher than bare CLI."
  ];

  const text = lines.join("\n");
  console.log(text);
  const outDir = path.join(REPO, ".security-gate", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "benchmark-latest.md"), text, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
