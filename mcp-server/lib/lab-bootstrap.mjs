/**
 * Scanner lab bootstrap: prerequisite detection + optional Docker Compose orchestration.
 * Does not install system Docker or Python (requires admin / user consent); returns copy-paste plans.
 *
 * Post-MVP extension (tracked in docs/ROADMAP.md — "Stack-scaffold templates + lab_bootstrap"):
 * - Use `project_profile` / stack signals to pick curated compose templates (e.g. Node vs Python).
 * - Optional `lab_bootstrap` actions or compose files per stack (beyond the single Semgrep+Crucible lab).
 * - Keep handbrake_scan gating before any dynamic tier; disposable bind mounts only.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const COMPOSE_FILENAME = "docker-compose.lab.yml";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
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

export function detectDocker() {
  const which = run("docker", ["version", "--format", "{{.Client.Version}}"]);
  if (!which.ok) {
    return {
      available: false,
      client: null,
      server: null,
      detail: which.combined || "docker CLI not found on PATH"
    };
  }
  const server = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  return {
    available: server.ok,
    client: which.stdout || null,
    server: server.ok ? server.stdout : null,
    detail: server.ok ? null : server.combined || "Docker daemon not reachable (is Docker Desktop running?)"
  };
}

export function detectPython() {
  const order = [
    ["python3", ["--version"]],
    ["python", ["--version"]]
  ];
  for (const [bin, args] of order) {
    const r = run(bin, args);
    if (r.ok && r.stdout) {
      return { available: true, command: bin, version: r.stdout };
    }
  }
  return { available: false, command: null, version: null };
}

function platformKey() {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "win32") return "windows";
  return "linux";
}

export function installPlan() {
  const pk = platformKey();
  const docker = {
    title: "Install Docker Engine / Docker Desktop",
    urls: [
      "https://docs.docker.com/get-docker/",
      "https://docs.docker.com/desktop/"
    ],
    commands:
      pk === "darwin"
        ? ["brew install --cask docker", "# Then open Docker.app and wait until it reports \"Docker is running\"."]
        : pk === "windows"
          ? [
              "# Install Docker Desktop for Windows from https://docs.docker.com/desktop/setup/install/windows-install/",
              "# Enable WSL2 backend when prompted, then start Docker Desktop."
            ]
          : [
              "# Debian / Ubuntu / derivatives:",
              "sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin",
              "sudo usermod -aG docker \"$USER\" && newgrp docker",
              "# Fedora / RHEL / derivatives (dnf):",
              "# sudo dnf install -y docker docker-compose-plugin && sudo systemctl enable --now docker",
              "# sudo usermod -aG docker \"$USER\" && newgrp docker",
              "# Arch Linux:",
              "# sudo pacman -S docker docker-compose && sudo systemctl enable --now docker"
            ]
  };

  const python = {
    title: "Install Python (optional if you only use the Docker lab)",
    urls: ["https://www.python.org/downloads/", "https://docs.python.org/3/using/index.html"],
    commands:
      pk === "darwin"
        ? ["brew install python@3.12"]
        : pk === "windows"
          ? [
              "winget install Python.Python.3.12",
              "# Alternative: download from https://www.python.org/downloads/windows/",
              "# If the `py` launcher exists: py -3 --version"
            ]
          : [
              "sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip",
              "# Fedora: sudo dnf install -y python3 python3-pip",
              "# Arch: sudo pacman -S python python-pip"
            ]
  };

  return {
    platform: pk,
    docker,
    python,
    disclaimer:
      "Security Gate never runs privileged installers for you. Review each command before executing it in your own terminal.",
    note:
      pk === "linux"
        ? "Linux families differ: the docker/python lines mix apt examples with commented dnf/pacman alternatives — pick what matches your distribution."
        : "Paths and installers vary by OS; always prefer vendor documentation when in doubt."
  };
}

function composeFile(repoRoot) {
  return path.join(repoRoot, COMPOSE_FILENAME);
}

function composeEnv(workspaceAbs) {
  return {
    ...process.env,
    LAB_WORKSPACE: workspaceAbs
  };
}

export function labComposeCommand(repoRoot, workspaceAbs, composeArgs) {
  const file = composeFile(repoRoot);
  if (!fs.existsSync(file)) {
    return { ok: false, stderr: `Missing compose file: ${file}` };
  }
  const r = run(
    "docker",
    ["compose", "-f", file, ...composeArgs],
    { cwd: repoRoot, env: composeEnv(workspaceAbs), timeout: 15 * 60 * 1000 }
  );
  return { ok: r.ok, stdout: r.stdout, stderr: r.stderr, combined: r.combined, code: r.code };
}

export function labComposePs(repoRoot, workspaceAbs) {
  const r = labComposeCommand(repoRoot, workspaceAbs, ["ps", "--format", "json"]);
  if (!r.ok) return { running: false, services: [], raw: r.combined };

  // `docker compose ps --format json` differs by version:
  //   - v2.21+:        a single JSON array
  //   - older versions: newline-delimited JSON objects
  // Handle both, plus the legitimate empty-stack case (no output / "[]").
  const raw = r.stdout || "";
  const trimmed = raw.trim();
  const services = [];

  if (!trimmed) {
    return { running: false, services, raw };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      services.push(...parsed);
    } else if (parsed && typeof parsed === "object") {
      services.push(parsed);
    }
  } catch {
    // Fall back to NDJSON: one JSON object per non-empty line.
    for (const line of trimmed.split("\n")) {
      const l = line.trim();
      if (!l) continue;
      try {
        const obj = JSON.parse(l);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) services.push(obj);
      } catch {
        // ignore non-json line noise
      }
    }
  }

  const running = services.some((s) =>
    typeof s === "object" && s !== null
      ? String(s.State || s.Status || "").toLowerCase().includes("running")
      : false
  );
  return { running, services, raw };
}

export function assertWorkspaceDir(p) {
  const abs = path.resolve(p);
  try {
    const st = fs.statSync(abs);
    if (!st.isDirectory()) return { ok: false, error: `Not a directory: ${abs}` };
  } catch {
    return { ok: false, error: `Workspace path does not exist: ${abs}` };
  }
  return { ok: true, path: abs };
}

export function getLabStatus({ repoRoot, workspaceRoot }) {
  const ws = assertWorkspaceDir(workspaceRoot);
  if (!ws.ok) {
    return { ok: false, error: ws.error };
  }
  const docker = detectDocker();
  const python = detectPython();
  let compose = null;
  if (docker.available) {
    compose = labComposePs(repoRoot, ws.path);
  }
  return {
    ok: true,
    repoRoot,
    workspaceRoot: ws.path,
    docker,
    python,
    compose,
    compose_file: composeFile(repoRoot),
    exec_examples: {
      semgrep:
        "docker compose -f docker-compose.lab.yml exec semgrep-lab semgrep --config auto --error /workspace",
      crucible_help: "docker compose -f docker-compose.lab.yml exec crucible-lab crucible --help"
    },
    one_click_note:
      "When Docker is available, use MCP tool lab_bootstrap with action=start (or autoStartIfReady=true on status) to pull/build and start semgrep-lab and crucible-lab. This is not a substitute for handbrake_scan before any live exploitation."
  };
}

export function runLabAction({ repoRoot, workspaceRoot, action, autoStartIfReady }) {
  const plan = installPlan();

  if (action === "install_plan") {
    return {
      ok: true,
      action: "install_plan",
      install_plan: plan,
      docker: detectDocker(),
      python: detectPython(),
      note: "This response is safe to read before you have a project folder. For compose operations, pass workspaceRoot or open a folder first."
    };
  }

  const base = getLabStatus({ repoRoot, workspaceRoot });
  if (!base.ok) return { ...base, install_plan: plan };

  const out = {
    action,
    ...base,
    install_plan: plan,
    auto_start_performed: false
  };

  if (!base.docker.available) {
    out.blocked_reason = "Docker is not available; follow install_plan.docker before start.";
    return out;
  }

  if (action === "status") {
    if (autoStartIfReady && base.docker.available && !base.compose?.running) {
      const up = labComposeCommand(repoRoot, base.workspaceRoot, ["up", "-d", "--build"]);
      out.compose_up = up;
      out.auto_start_performed = true;
      out.compose = labComposePs(repoRoot, base.workspaceRoot);
    }
    return out;
  }

  if (action === "start") {
    const up = labComposeCommand(repoRoot, base.workspaceRoot, ["up", "-d", "--build"]);
    out.compose_up = up;
    out.compose = labComposePs(repoRoot, base.workspaceRoot);
    return out;
  }

  if (action === "stop") {
    const down = labComposeCommand(repoRoot, base.workspaceRoot, ["down"]);
    out.compose_down = down;
    out.compose = labComposePs(repoRoot, base.workspaceRoot);
    return out;
  }

  return { ...out, blocked_reason: `Unknown action: ${action}` };
}

export function startupSummaryLine({ repoRoot, workspaceRoot }) {
  try {
    const st = getLabStatus({ repoRoot, workspaceRoot });
    if (!st.ok) return { level: "warn", text: st.error };
    const d = st.docker.available ? "docker:ok" : "docker:missing";
    const p = st.python.available ? "python:ok" : "python:missing";
    const c = st.compose?.running ? "lab:up" : "lab:down";
    return { level: "info", text: `[security-gate-mcp] scanner lab: ${d}; ${p}; ${c} (run lab_bootstrap for details)` };
  } catch (e) {
    return { level: "warn", text: `[security-gate-mcp] scanner lab probe failed: ${String(e?.message || e)}` };
  }
}
