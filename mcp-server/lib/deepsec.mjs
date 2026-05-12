/**
 * DeepSec (Vercel Labs) Tier-3 review wrapper.
 *
 * Honest constraints baked in:
 * - DeepSec requires Node.js 22+ and pnpm on the host (no Docker image is published).
 * - DeepSec scaffolds into `<workspace>/.deepsec/` and reads credentials from `.deepsec/.env.local`.
 * - Real scans consume LLM API quota: this wrapper NEVER auto-runs `scan`; the caller must pass action="scan"
 *   explicitly, and the default `--limit` is small to keep cost bounded.
 *
 * Action surface (called from the `deepsec_review` MCP tool):
 *   - status        → detection only (no network, no install, no scan)
 *   - install_plan  → copy-paste commands for Node 22+, pnpm, AI Gateway / Anthropic credentials
 *   - init          → spawns `npx --yes deepsec@latest init` and `pnpm install` inside `.deepsec/`
 *   - scan          → runs `pnpm deepsec scan` + `pnpm deepsec process` with a `--limit` cap
 *   - report        → runs `pnpm deepsec export --format md-dir --out ./findings`
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SCAFFOLD_DIR_NAME = ".deepsec";
const ENV_FILE_NAME = ".env.local";
const SAFE_SCAN_LIMIT = 50;
const SAFE_SCAN_LIMIT_MAX = 500;
const SPAWN_TIMEOUT_MS = 30 * 60 * 1000;

const CRED_KEYS = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "ANTHROPIC_AUTH_TOKEN"];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
    timeout: opts.timeout ?? SPAWN_TIMEOUT_MS,
    ...opts
  });
  const stdout = (r.stdout || "").trim();
  const stderr = (r.stderr || "").trim();
  return {
    ok: r.status === 0,
    code: r.status,
    signal: r.signal,
    stdout,
    stderr,
    combined: [stdout, stderr].filter(Boolean).join("\n")
  };
}

function platformKey() {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "win32") return "windows";
  return "linux";
}

export function detectNode() {
  const r = run("node", ["--version"]);
  if (!r.ok) return { available: false, version: null, major: null, satisfies22: false };
  const v = r.stdout.replace(/^v/, "");
  const major = Number(v.split(".")[0]);
  return {
    available: true,
    version: r.stdout,
    major: Number.isFinite(major) ? major : null,
    satisfies22: Number.isFinite(major) && major >= 22
  };
}

export function detectPnpm() {
  const r = run("pnpm", ["--version"]);
  return r.ok
    ? { available: true, version: r.stdout }
    : { available: false, version: null };
}

export function detectNpx() {
  const r = run("npx", ["--version"]);
  return r.ok
    ? { available: true, version: r.stdout }
    : { available: false, version: null };
}

function parseDotEnv(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function readEnvLocal(scaffoldDir) {
  const envPath = path.join(scaffoldDir, ENV_FILE_NAME);
  try {
    return { exists: true, values: parseDotEnv(fs.readFileSync(envPath, "utf8")), path: envPath };
  } catch {
    return { exists: false, values: {}, path: envPath };
  }
}

export function detectScaffold(workspaceRoot) {
  const scaffoldDir = path.join(workspaceRoot, SCAFFOLD_DIR_NAME);
  let exists = false;
  let pkgJson = false;
  try {
    const st = fs.statSync(scaffoldDir);
    exists = st.isDirectory();
  } catch {
    exists = false;
  }
  if (exists) {
    pkgJson = fs.existsSync(path.join(scaffoldDir, "package.json"));
  }
  return {
    scaffoldDir,
    exists,
    pkgJsonPresent: pkgJson,
    envFile: path.join(scaffoldDir, ENV_FILE_NAME)
  };
}

export function detectCredentials(workspaceRoot) {
  const scaffold = detectScaffold(workspaceRoot);
  const envLocal = scaffold.exists ? readEnvLocal(scaffold.scaffoldDir) : { exists: false, values: {} };
  const found = {};
  for (const key of CRED_KEYS) {
    if (process.env[key]) found[key] = "process_env";
    else if (envLocal.values[key]) found[key] = ".deepsec/.env.local";
  }
  return {
    available: Object.keys(found).length > 0,
    sources: found,
    checked_keys: CRED_KEYS,
    env_file_present: !!envLocal.exists
  };
}

export function installPlan() {
  const pk = platformKey();
  const node = {
    title: "Install Node.js 22+ (DeepSec requires Node 22+; the rest of Security Gate accepts 18.18+)",
    urls: ["https://nodejs.org/", "https://nodejs.org/en/download"],
    commands:
      pk === "darwin"
        ? [
            "brew install node@22",
            "# Or use nvm: nvm install 22 && nvm use 22"
          ]
        : pk === "windows"
          ? [
              "winget install OpenJS.NodeJS.LTS",
              "# Or use nvm-windows: nvm install 22 && nvm use 22"
            ]
          : [
              "# nvm (recommended): https://github.com/nvm-sh/nvm",
              "nvm install 22 && nvm use 22",
              "# Or Debian/Ubuntu via nodesource:",
              "# curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs"
            ]
  };

  const pnpm = {
    title: "Enable pnpm via corepack (DeepSec uses pnpm inside .deepsec/)",
    urls: ["https://pnpm.io/installation"],
    commands: ["corepack enable", "corepack prepare pnpm@latest --activate", "pnpm --version"]
  };

  const credentials = {
    title: "Provide one DeepSec credential (in .deepsec/.env.local or as a shell env var)",
    options: [
      {
        label: "Vercel AI Gateway (recommended)",
        envVar: "AI_GATEWAY_API_KEY",
        urls: ["https://vercel.com/ai-gateway"]
      },
      {
        label: "Vercel OIDC token (re-pull every 12h)",
        envVar: "VERCEL_OIDC_TOKEN",
        commands: ["npx vercel link", "npx vercel env pull"]
      },
      {
        label: "Anthropic direct",
        envVar: "ANTHROPIC_AUTH_TOKEN",
        urls: ["https://console.anthropic.com/"]
      }
    ],
    cost_note:
      "Always start with `deepsec_review action=scan limit=50` for calibration. DeepSec's `process` step calls Anthropic-class models; per-FAQ rough order is ~$25–60 / 100 files for Opus-level runs (verify against current DeepSec pricing — Confidence: Med)."
  };

  return {
    platform: pk,
    node,
    pnpm,
    credentials,
    disclaimer:
      "Security Gate never runs privileged installers for you. Review each command before executing it. DeepSec runs Anthropic-class models; calibrate with small limits before broad scans."
  };
}

export function getDeepSecStatus({ workspaceRoot }) {
  const node = detectNode();
  const pnpm = detectPnpm();
  const npx = detectNpx();
  const scaffold = detectScaffold(workspaceRoot);
  const credentials = detectCredentials(workspaceRoot);
  const ready = node.satisfies22 && pnpm.available && scaffold.exists && credentials.available;
  return {
    ok: true,
    workspaceRoot,
    node,
    pnpm,
    npx,
    scaffold,
    credentials,
    ready,
    next_action_hint: ready
      ? "Run deepsec_review with action=scan (default limit=50) for a calibration pass."
      : !node.satisfies22
        ? "Install Node.js 22+ first (action=install_plan)."
        : !pnpm.available
          ? "Enable pnpm via corepack (action=install_plan)."
          : !scaffold.exists
            ? "Run deepsec_review action=init inside the workspace."
            : "Add one DeepSec credential to .deepsec/.env.local (see action=install_plan)."
  };
}

function runInWorkspace(workspaceRoot, cmd, args) {
  return run(cmd, args, { cwd: workspaceRoot, env: { ...process.env } });
}

function runInScaffold(scaffoldDir, cmd, args) {
  return run(cmd, args, { cwd: scaffoldDir, env: { ...process.env } });
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return SAFE_SCAN_LIMIT;
  return Math.min(Math.floor(n), SAFE_SCAN_LIMIT_MAX);
}

function preflight({ status, requireCredentials }) {
  const blocks = [];
  if (!status.node.satisfies22) {
    blocks.push(`Node ${status.node.major ?? "?"} detected; DeepSec requires Node 22+.`);
  }
  if (!status.pnpm.available) {
    blocks.push("pnpm is not on PATH. Use corepack to enable it (see install_plan).");
  }
  if (!status.npx.available) {
    blocks.push("npx is not on PATH. Reinstall Node from nodejs.org or fix shell PATH.");
  }
  if (requireCredentials && !status.credentials.available) {
    blocks.push(
      `No DeepSec credential found in process env or .deepsec/.env.local (checked: ${status.credentials.checked_keys.join(", ")}).`
    );
  }
  return blocks;
}

export function runDeepSecAction({ workspaceRoot, action, limit }) {
  const status = getDeepSecStatus({ workspaceRoot });
  const plan = installPlan();

  if (action === "install_plan") {
    return {
      ok: true,
      action,
      install_plan: plan,
      status,
      note: "Run these commands manually; Security Gate does not execute privileged installers."
    };
  }

  if (action === "status") {
    return { ok: true, action, status, install_plan_hint: "Run action=install_plan if any field is missing." };
  }

  if (action === "init") {
    const blocks = preflight({ status, requireCredentials: false });
    if (blocks.length) {
      return { ok: false, action, status, blocked_reason: blocks.join(" "), install_plan: plan };
    }
    const initResult = runInWorkspace(workspaceRoot, "npx", ["--yes", "deepsec@latest", "init"]);
    let installResult = null;
    if (initResult.ok) {
      installResult = runInScaffold(status.scaffold.scaffoldDir, "pnpm", ["install"]);
    }
    return {
      ok: initResult.ok && (installResult?.ok ?? true),
      action,
      status: getDeepSecStatus({ workspaceRoot }),
      init: initResult,
      pnpm_install: installResult,
      next_step: "Add one credential to .deepsec/.env.local, then call action=scan."
    };
  }

  if (action === "scan") {
    const blocks = preflight({ status, requireCredentials: true });
    if (blocks.length) {
      return { ok: false, action, status, blocked_reason: blocks.join(" "), install_plan: plan };
    }
    const lim = clampLimit(limit);
    const scaffold = status.scaffold.scaffoldDir;
    const scanResult = runInScaffold(scaffold, "pnpm", ["deepsec", "scan", "--limit", String(lim)]);
    let processResult = null;
    if (scanResult.ok) {
      processResult = runInScaffold(scaffold, "pnpm", ["deepsec", "process"]);
    }
    return {
      ok: scanResult.ok && (processResult?.ok ?? false),
      action,
      limit_used: lim,
      status,
      scan: scanResult,
      process: processResult,
      next_step: scanResult.ok
        ? "Call action=report to export findings as markdown under .deepsec/findings/."
        : "Read scan.stderr above and re-run with adjusted credentials/limit."
    };
  }

  if (action === "report") {
    const blocks = preflight({ status, requireCredentials: false });
    if (blocks.length) {
      return { ok: false, action, status, blocked_reason: blocks.join(" "), install_plan: plan };
    }
    const scaffold = status.scaffold.scaffoldDir;
    const exportResult = runInScaffold(scaffold, "pnpm", [
      "deepsec",
      "export",
      "--format",
      "md-dir",
      "--out",
      "./findings"
    ]);
    return {
      ok: exportResult.ok,
      action,
      status,
      export: exportResult,
      findings_dir: path.join(scaffold, "findings"),
      note: "If the export folder is empty, run action=scan first."
    };
  }

  return { ok: false, action, blocked_reason: `Unknown action: ${action}` };
}
