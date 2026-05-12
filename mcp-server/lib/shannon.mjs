/**
 * Shannon (KeygraphHQ) Tier-2 dynamic web/API pentest wrapper.
 *
 * Honest constraints baked in:
 * - Shannon is an *autonomous exploit* tool. The wrapper never starts a pentest unless the caller
 *   passes action="pentest" explicitly AND the target URL passes a local "looks-disposable" check
 *   (handbrake_scan should also be green at the conversation level — that is the agent's job).
 * - Shannon needs Docker (it manages its own internal containers) and Node 18+.
 * - Shannon needs an Anthropic-compatible credential. We accept ANTHROPIC_API_KEY (native) and
 *   ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (OpenRouter / Vercel AI Gateway proxy mode).
 *
 * Action surface (called from the `shannon_pentest` MCP tool):
 *   - status        → detection only (no network, no install, no pentest)
 *   - install_plan  → copy-paste commands for Docker, Node 18+, Anthropic credentials
 *   - setup         → spawns `npx --yes @keygraph/shannon setup`
 *   - pentest       → spawns `npx --yes @keygraph/shannon start -u <target> -r <repo>` (gated)
 *   - report        → reads the Shannon report directory (best-effort)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SAFE_HOST_ALLOWLIST = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal"
]);

const PROD_HOST_HINTS = /\b(prod|production|live|admin|internal)\b/i;

const SPAWN_TIMEOUT_MS = 60 * 60 * 1000;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
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

export function detectDocker() {
  const r = run("docker", ["version", "--format", "{{.Client.Version}}"]);
  if (!r.ok) return { available: false, version: null, detail: r.combined || "docker CLI not found on PATH" };
  const server = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  return {
    available: server.ok,
    version: r.stdout || null,
    server: server.ok ? server.stdout : null,
    detail: server.ok ? null : server.combined || "Docker daemon not reachable"
  };
}

export function detectNode() {
  const r = run("node", ["--version"]);
  if (!r.ok) return { available: false, version: null, major: null, satisfies18: false };
  const v = r.stdout.replace(/^v/, "");
  const major = Number(v.split(".")[0]);
  return {
    available: true,
    version: r.stdout,
    major: Number.isFinite(major) ? major : null,
    satisfies18: Number.isFinite(major) && major >= 18
  };
}

export function detectNpx() {
  const r = run("npx", ["--version"]);
  return r.ok ? { available: true, version: r.stdout } : { available: false, version: null };
}

export function detectCredentials() {
  const env = process.env;
  const found = {};
  if (env.ANTHROPIC_API_KEY) found.ANTHROPIC_API_KEY = "process_env";
  if (env.ANTHROPIC_AUTH_TOKEN && env.ANTHROPIC_BASE_URL) {
    found.ANTHROPIC_AUTH_TOKEN_WITH_BASE_URL = "process_env";
  }
  return {
    available: Object.keys(found).length > 0,
    sources: found,
    notes: [
      "Shannon expects Anthropic-compatible credentials. Two supported modes:",
      "1) Native Anthropic: set ANTHROPIC_API_KEY.",
      "2) Proxy (OpenRouter / Vercel AI Gateway): set ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (e.g. https://openrouter.ai/api/v1)."
    ]
  };
}

function classifyTarget(targetUrl) {
  if (!targetUrl) {
    return { ok: false, reason: "No target URL provided." };
  }
  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    return { ok: false, reason: `Invalid URL: ${targetUrl}` };
  }
  const host = url.hostname.toLowerCase();
  if (SAFE_HOST_ALLOWLIST.has(host)) {
    return { ok: true, host, scheme: url.protocol, reason: "host on local/dev allowlist" };
  }
  if (PROD_HOST_HINTS.test(host)) {
    return { ok: false, host, reason: `Host "${host}" looks production-like (matched /prod|production|live|admin|internal/)` };
  }
  if (host.endsWith(".internal") || host.endsWith(".prod") || host.endsWith(".live")) {
    return { ok: false, host, reason: `Host suffix on "${host}" looks production-like` };
  }
  return {
    ok: true,
    host,
    scheme: url.protocol,
    reason: "Host is not on the local allowlist but did not match obvious prod-like patterns; the caller is responsible for confirming it is disposable."
  };
}

export function installPlan() {
  const pk = platformKey();
  const docker = {
    title: "Install Docker (Shannon manages its own internal containers)",
    urls: ["https://docs.docker.com/get-docker/"],
    commands:
      pk === "darwin"
        ? ["brew install --cask docker", "# open Docker.app, wait for \"Docker is running\""]
        : pk === "windows"
          ? [
              "# Install Docker Desktop from https://docs.docker.com/desktop/setup/install/windows-install/",
              "# Enable WSL2 backend when prompted, then start Docker Desktop."
            ]
          : [
              "sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin",
              "sudo usermod -aG docker \"$USER\" && newgrp docker",
              "# Fedora: sudo dnf install -y docker docker-compose-plugin && sudo systemctl enable --now docker"
            ]
  };
  const node = {
    title: "Ensure Node.js 18+ for npx @keygraph/shannon",
    urls: ["https://nodejs.org/"],
    commands:
      pk === "darwin"
        ? ["brew install node", "# or: nvm install 20 && nvm use 20"]
        : pk === "windows"
          ? ["winget install OpenJS.NodeJS.LTS"]
          : ["# nvm install 20 && nvm use 20", "# or: sudo apt-get install -y nodejs"]
  };
  const credentials = {
    title: "Provide Shannon credentials (one of)",
    options: [
      {
        label: "Native Anthropic (recommended for quality)",
        envVars: ["ANTHROPIC_API_KEY"],
        urls: ["https://console.anthropic.com/"]
      },
      {
        label: "OpenRouter free / paid tier (Anthropic-compatible proxy — see docs/FREE_VS_PAID_LLM.md)",
        envVars: ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"],
        urls: ["https://openrouter.ai/keys"],
        example: {
          ANTHROPIC_BASE_URL: "https://openrouter.ai/api/v1",
          ANTHROPIC_AUTH_TOKEN: "<openrouter-key>",
          ANTHROPIC_MODEL: "anthropic/claude-3.5-sonnet (or a :free variant)"
        }
      },
      {
        label: "Vercel AI Gateway",
        envVars: ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"],
        urls: ["https://vercel.com/ai-gateway"]
      }
    ],
    cost_note:
      "Shannon executes autonomous exploits and can consume many LLM tool calls. Always start against a containerized disposable target. Free OpenRouter routes are rate-limited (50 req/day without deposit); long pentests will hit the cap quickly."
  };
  return { platform: pk, docker, node, credentials };
}

export function getShannonStatus({ workspaceRoot, targetUrl }) {
  const docker = detectDocker();
  const node = detectNode();
  const npx = detectNpx();
  const credentials = detectCredentials();
  const target = classifyTarget(targetUrl || "");
  const ready =
    docker.available && node.satisfies18 && npx.available && credentials.available && target.ok && !!targetUrl;
  return {
    ok: true,
    workspaceRoot,
    docker,
    node,
    npx,
    credentials,
    target,
    ready,
    next_action_hint: ready
      ? "Call action=pentest with explicit target_url + repo_path (defaults to workspaceRoot)."
      : !docker.available
        ? "Install Docker first (action=install_plan)."
        : !node.satisfies18
          ? "Install Node 18+ first (action=install_plan)."
          : !credentials.available
            ? "Export ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (action=install_plan)."
            : !targetUrl
              ? "Provide target_url (must be a disposable test environment)."
              : `Target classification: ${target.reason}`
  };
}

function preflight({ status, requireTarget, requireCredentials }) {
  const blocks = [];
  if (!status.docker.available) blocks.push("Docker is not available. Install / start Docker first.");
  if (!status.node.satisfies18) blocks.push(`Node ${status.node.major ?? "?"} detected; Shannon requires Node 18+.`);
  if (!status.npx.available) blocks.push("npx is not on PATH. Reinstall Node or fix shell PATH.");
  if (requireCredentials && !status.credentials.available) {
    blocks.push("No Anthropic-compatible credential found in process env. Export ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL.");
  }
  if (requireTarget && !status.target.ok) {
    blocks.push(`Target classification rejected: ${status.target.reason}`);
  }
  return blocks;
}

export function runShannonAction({ workspaceRoot, action, targetUrl, repoPath, dryRun }) {
  const status = getShannonStatus({ workspaceRoot, targetUrl });
  const plan = installPlan();

  if (action === "install_plan") {
    return { ok: true, action, install_plan: plan, status };
  }

  if (action === "status") {
    return { ok: true, action, status, install_plan_hint: "Run action=install_plan if any field is missing." };
  }

  if (action === "setup") {
    const blocks = preflight({ status, requireTarget: false, requireCredentials: false });
    if (blocks.length) return { ok: false, action, status, blocked_reason: blocks.join(" "), install_plan: plan };
    const setupResult = run("npx", ["--yes", "@keygraph/shannon", "setup"], { cwd: workspaceRoot });
    return {
      ok: setupResult.ok,
      action,
      status,
      setup: setupResult,
      next_step: setupResult.ok ? "Run action=pentest with target_url + repo_path." : "Read setup.stderr above."
    };
  }

  if (action === "pentest") {
    const blocks = preflight({ status, requireTarget: true, requireCredentials: true });
    if (blocks.length) return { ok: false, action, status, blocked_reason: blocks.join(" "), install_plan: plan };
    const repo = repoPath ? path.resolve(repoPath) : workspaceRoot;
    try {
      const st = fs.statSync(repo);
      if (!st.isDirectory()) {
        return { ok: false, action, status, blocked_reason: `repo_path is not a directory: ${repo}` };
      }
    } catch {
      return { ok: false, action, status, blocked_reason: `repo_path does not exist: ${repo}` };
    }
    if (dryRun === true) {
      return {
        ok: true,
        action,
        dry_run: true,
        status,
        planned_command: ["npx", "--yes", "@keygraph/shannon", "start", "-u", targetUrl, "-r", repo],
        note: "Dry run: no execution performed. Call again without dryRun=true to actually launch the pentest."
      };
    }
    const args = ["--yes", "@keygraph/shannon", "start", "-u", targetUrl, "-r", repo];
    const pentestResult = run("npx", args, { cwd: workspaceRoot });
    return {
      ok: pentestResult.ok,
      action,
      status,
      target_url: targetUrl,
      repo_path: repo,
      pentest: pentestResult,
      next_step: pentestResult.ok ? "Call action=report to read the Shannon output directory." : "Read pentest.stderr above."
    };
  }

  if (action === "report") {
    const reportRoot = path.join(workspaceRoot, ".shannon");
    const exists = fs.existsSync(reportRoot);
    let files = [];
    if (exists) {
      try {
        files = fs.readdirSync(reportRoot).map((name) => path.join(reportRoot, name));
      } catch {
        files = [];
      }
    }
    return {
      ok: true,
      action,
      report_dir: reportRoot,
      exists,
      files,
      note: exists
        ? "Open the files above for findings. Shannon's report layout follows the upstream README."
        : "No `.shannon/` directory found. Run a pentest first or consult Shannon's vendor docs for the actual output path."
    };
  }

  return { ok: false, action, blocked_reason: `Unknown action: ${action}` };
}
