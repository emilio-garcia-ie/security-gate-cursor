/**
 * Security Gate's own Semgrep scanner.
 *
 * Context (May 2026): the official `ghcr.io/semgrep/mcp` standalone server was DEPRECATED in
 * Semgrep v0.9.0 — it now exposes only a `deprecation_notice` tool. The replacement
 * `semgrep mcp` subcommand requires the Pro Engine (paid). To keep an OSS-only path callable
 * by the agent (and to satisfy the workspace rule that pre-flight scans content with
 * `semgrep_scan`), Security Gate bundles its own thin wrapper around the OSS Semgrep CLI.
 *
 * Resolution order for the underlying engine:
 *   1. Host binary `semgrep` (Community Edition is fine).
 *   2. Docker fallback: `docker run --rm semgrep/semgrep:latest semgrep …` when host CLI is missing.
 *
 * Action surface (called from the `semgrep_scan` MCP tool):
 *   - status     → detect host + Docker availability, report which engine would be used.
 *   - scan_path  → run `semgrep scan --config <config> --json <path>` and return parsed findings (summary).
 *   - scan_text  → write the snippet to a tempfile and scan it (used by the safety pre-flight rule).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// Default ruleset: `p/ci` is the broad OSS-friendly registry pack (covers OWASP-aligned rules)
// and does NOT require metrics. The `auto` config Semgrep ships with REQUIRES `--metrics=on`,
// so we only allow it when explicitly requested and omit `--metrics=off` in that case.
const DEFAULT_CONFIG = "p/ci";
const SAFE_SCAN_TIMEOUT_MS = 5 * 60 * 1000;
const SAFE_PATH_DEPTH_LIMIT = 8;
const SAFE_PATH_FILE_LIMIT = 5000;
const SUPPORTED_LANGS = ["javascript", "typescript", "python", "go", "java", "ruby", "php", "c", "cpp", "csharp", "kotlin", "rust"];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: false,
    timeout: opts.timeout ?? SAFE_SCAN_TIMEOUT_MS,
    ...opts
  });
  return {
    ok: r.status === 0,
    code: r.status,
    signal: r.signal,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    combined: [(r.stdout ?? "").trim(), (r.stderr ?? "").trim()].filter(Boolean).join("\n")
  };
}

export function detectHostSemgrep() {
  const r = run("semgrep", ["--version"]);
  if (!r.ok) return { available: false, version: null, path: null };
  return { available: true, version: r.stdout.trim(), path: locate("semgrep") };
}

export function detectDocker() {
  const r = run("docker", ["version", "--format", "{{.Client.Version}}"]);
  return r.ok ? { available: true, version: r.stdout.trim() } : { available: false, version: null };
}

function locate(bin) {
  const r = run("which", [bin]);
  return r.ok ? r.stdout.trim() : null;
}

function pickEngine() {
  const host = detectHostSemgrep();
  if (host.available) return { kind: "host", host };
  const docker = detectDocker();
  if (docker.available) return { kind: "docker", host, docker };
  return { kind: "none", host, docker: { available: false } };
}

function safetyChecksForPath(targetPath) {
  let st;
  try {
    st = fs.statSync(targetPath);
  } catch {
    return { ok: false, reason: `path does not exist: ${targetPath}` };
  }
  if (!st.isDirectory() && !st.isFile()) {
    return { ok: false, reason: `path is not a file or directory: ${targetPath}` };
  }
  if (st.isDirectory()) {
    const fileCount = countFiles(targetPath);
    if (fileCount > SAFE_PATH_FILE_LIMIT) {
      return {
        ok: false,
        reason: `target has ${fileCount} files (> ${SAFE_PATH_FILE_LIMIT}). Narrow the scope or scan a subdirectory.`
      };
    }
  }
  return { ok: true };
}

function countFiles(root) {
  let total = 0;
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (depth > SAFE_PATH_DEPTH_LIMIT) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === ".venv" || e.name === "dist") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push({ dir: full, depth: depth + 1 });
      } else if (e.isFile()) {
        total += 1;
        if (total > SAFE_PATH_FILE_LIMIT) return total;
      }
    }
  }
  return total;
}

function runSemgrepHost({ targetPath, config, extraArgs }) {
  const args = ["scan", "--config", config, "--json", "--quiet"];
  if (config !== "auto") args.push("--metrics=off");
  if (extraArgs?.length) args.push(...extraArgs);
  args.push(targetPath);
  const t0 = performance.now();
  const r = run("semgrep", args, { cwd: path.dirname(targetPath) });
  const elapsed_ms = Math.round(performance.now() - t0);
  const acceptable = r.code === 0 || r.code === 1;
  return { ok: acceptable, code: r.code, stdout: r.stdout, stderr: r.stderr, elapsed_ms };
}

function runSemgrepDocker({ targetPath, config, extraArgs }) {
  const abs = path.resolve(targetPath);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return { ok: false, code: -1, stdout: "", stderr: `path missing: ${abs}`, elapsed_ms: 0 };
  }
  const mountDir = stat.isDirectory() ? abs : path.dirname(abs);
  const mountTarget = "/src";
  const relative = stat.isDirectory() ? "." : path.relative(mountDir, abs);
  const innerPath = stat.isDirectory() ? mountTarget : path.posix.join(mountTarget, relative.split(path.sep).join("/"));
  const inner = ["semgrep", "scan", "--config", config, "--json", "--quiet"];
  if (config !== "auto") inner.push("--metrics=off");
  if (extraArgs?.length) inner.push(...extraArgs);
  inner.push(innerPath);
  const dockerArgs = [
    "run", "--rm",
    "-v", `${mountDir}:${mountTarget}:ro`,
    "-w", mountTarget,
    "semgrep/semgrep:latest",
    ...inner
  ];
  const t0 = performance.now();
  const r = run("docker", dockerArgs);
  const elapsed_ms = Math.round(performance.now() - t0);
  const acceptable = r.code === 0 || r.code === 1;
  return { ok: acceptable, code: r.code, stdout: r.stdout, stderr: r.stderr, elapsed_ms };
}

function scanMetaFromJson(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const ids = new Set(results.map((r) => r?.check_id).filter(Boolean));
  const scanned = Array.isArray(parsed.paths?.scanned) ? parsed.paths.scanned.length : null;
  return {
    semgrep_version: parsed.version ?? null,
    unique_check_ids: ids.size,
    paths_scanned_count: scanned,
    engine_errors_count: Array.isArray(parsed.errors) ? parsed.errors.length : 0
  };
}

function summarize(json) {
  if (!json || typeof json !== "object") return null;
  const results = Array.isArray(json.results) ? json.results : [];
  const errors = Array.isArray(json.errors) ? json.errors : [];
  const bySeverity = {};
  const byRule = {};
  for (const r of results) {
    const sev = (r?.extra?.severity || r?.severity || "INFO").toString().toUpperCase();
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    const rule = r?.check_id || r?.ruleId || "unknown";
    byRule[rule] = (byRule[rule] || 0) + 1;
  }
  const top = results.slice(0, 10).map((r) => ({
    check_id: r?.check_id || null,
    severity: (r?.extra?.severity || r?.severity || "INFO").toString().toUpperCase(),
    path: r?.path || null,
    line: r?.start?.line || null,
    message: (r?.extra?.message || r?.message || "").slice(0, 240)
  }));
  return {
    total_findings: results.length,
    by_severity: bySeverity,
    by_rule_top: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 8),
    sample_findings: top,
    engine_errors: errors.length,
    engine_errors_sample: errors.slice(0, 3)
  };
}

export function semgrepStatus() {
  const host = detectHostSemgrep();
  const docker = detectDocker();
  const kind = host.available ? "host" : docker.available ? "docker" : "none";
  return {
    ok: true,
    engine: kind,
    host_semgrep: host,
    docker,
    next_action_hint:
      kind === "none"
        ? "Install Semgrep CE (brew install semgrep / pip install semgrep) OR Docker (then we will use semgrep/semgrep:latest)."
        : kind === "host"
          ? "Host Semgrep ready. Call action=scan_path or action=scan_text."
          : "Docker fallback ready. Call action=scan_path or action=scan_text (will spawn semgrep/semgrep:latest)."
  };
}

export function semgrepScanPath({ targetPath, config, extraArgs }) {
  const safety = safetyChecksForPath(targetPath);
  if (!safety.ok) return { ok: false, blocked_reason: safety.reason };
  const engine = pickEngine();
  const cfg = config && typeof config === "string" ? config : DEFAULT_CONFIG;
  if (engine.kind === "none") {
    return {
      ok: false,
      blocked_reason: "No Semgrep engine available. Install Semgrep CE on the host or install Docker (then we can use semgrep/semgrep:latest)."
    };
  }
  const exec = engine.kind === "host"
    ? runSemgrepHost({ targetPath, config: cfg, extraArgs })
    : runSemgrepDocker({ targetPath, config: cfg, extraArgs });
  if (!exec.ok) {
    return {
      ok: false,
      engine: engine.kind,
      exit_code: exec.code,
      stderr: exec.stderr.slice(0, 4000),
      blocked_reason: "Semgrep engine returned a non-acceptable exit code (not 0 / 1)."
    };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(exec.stdout || "null");
  } catch {
    parsed = null;
  }
  const summary = summarize(parsed);
  const scan_meta = scanMetaFromJson(parsed);
  return {
    ok: true,
    engine: engine.kind,
    config: cfg,
    exit_code: exec.code,
    elapsed_ms: exec.elapsed_ms ?? null,
    scan_meta,
    findings_present: (summary?.total_findings ?? 0) > 0,
    summary,
    stderr_tail: exec.stderr.slice(-2000) || null
  };
}

export function semgrepScanText({ snippet, language, config, extraArgs }) {
  if (typeof snippet !== "string" || snippet.length === 0) {
    return { ok: false, blocked_reason: "snippet is required (non-empty string)" };
  }
  if (snippet.length > 200_000) {
    return { ok: false, blocked_reason: "snippet too large (>200 KB). Save it to a file and use scan_path." };
  }
  const lang = (language || "").toLowerCase();
  const ext = languageToExtension(lang);
  if (!ext) {
    return {
      ok: false,
      blocked_reason: `unsupported language: ${language || "(empty)"} — supported: ${SUPPORTED_LANGS.join(", ")}`
    };
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "security-gate-semgrep-"));
  const file = path.join(tmpDir, `snippet-${crypto.randomBytes(4).toString("hex")}.${ext}`);
  fs.writeFileSync(file, snippet, "utf8");
  try {
    const result = semgrepScanPath({ targetPath: file, config, extraArgs });
    return { ...result, scanned_file: file, scanned_language: lang };
  } finally {
    // Leave the tempfile for one minute so the agent can re-read it if needed; cron / OS cleans /tmp.
  }
}

function languageToExtension(lang) {
  switch (lang) {
    case "javascript": return "js";
    case "typescript": return "ts";
    case "python": return "py";
    case "go": return "go";
    case "java": return "java";
    case "ruby": return "rb";
    case "php": return "php";
    case "c": return "c";
    case "cpp": return "cpp";
    case "csharp": return "cs";
    case "kotlin": return "kt";
    case "rust": return "rs";
    default: return null;
  }
}

export function runSemgrepAction({ action, workspaceRoot, target_path, config, extra_args, snippet, language }) {
  if (action === "status") return semgrepStatus();
  if (action === "scan_path") {
    const target = target_path ? path.resolve(target_path) : workspaceRoot;
    return semgrepScanPath({ targetPath: target, config, extraArgs: extra_args });
  }
  if (action === "scan_text") {
    return semgrepScanText({ snippet: snippet || "", language: language || "", config, extraArgs: extra_args });
  }
  return { ok: false, blocked_reason: `Unknown action: ${action}` };
}
