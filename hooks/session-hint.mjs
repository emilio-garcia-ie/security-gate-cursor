#!/usr/bin/env node
/**
 * Session start hint for Security Gate demos.
 *
 * The `sessionStart` hook event is informational, not a permission gate.
 * To be safe across Cursor hook schema variants, this script:
 *   - Reads (and ignores) stdin without crashing.
 *   - Writes a short hint to stderr (Cursor typically surfaces hook stderr).
 *   - Writes an empty JSON object to stdout, which is a no-op for any hook
 *     dispatcher that expects JSON.
 *
 * It always exits 0 to fail open.
 */
import fs from "node:fs";

function safeReadStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  safeReadStdin();

  const hint =
    "Security Gate active. Run MCP tool `handbrake_scan` before any live exploit testing. " +
    "Tier-1 static: bundled `semgrep_scan` (OSS Semgrep CE on host or Docker fallback — no Pro Engine, no extra MCP entry needed). " +
    "For an isolated Semgrep/Crucible lab in Docker, run MCP tool `lab_bootstrap` (see SETUP.md). " +
    "Tier-2 dynamic web/API pentest: `shannon_pentest` (Docker + Node 18+ + Anthropic-compatible key — disposable targets only). " +
    "Tier-2.5 runtime defense (Python agents): `llamafirewall_advisor` (advisor only; never executes). " +
    "Tier-3 deep review: `deepsec_review` — start with action=status, never skip the default limit. " +
    "Free vs paid LLM trade-offs: see docs/FREE_VS_PAID_LLM.md. " +
    "Demo targets (one at a time): `npm run demo:webapp` or `npm run demo:agent` (auto free ports + URLs). Stop one: `npm run demo:down -- webapp|agent`. Raw compose defaults: web 23000, agent 18501; override SECURITY_GATE_WEBAPP_PORT / SECURITY_GATE_AGENT_PORT.";

  // Stderr is shown by Cursor when hooks emit diagnostics; it never corrupts
  // a JSON-RPC channel because hooks don't speak JSON-RPC on stdout.
  process.stderr.write(`[security-gate] ${hint}\n`);

  // A neutral JSON object is the safest stdout payload: it can't be mistaken
  // for an allow/deny gate, and dispatchers that parse JSON will accept it.
  process.stdout.write("{}\n");
}

main()
  .then(() => process.exit(0))
  .catch(() => {
    try {
      process.stdout.write("{}\n");
    } catch {
      // ignore
    }
    process.exit(0);
  });
