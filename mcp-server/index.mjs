#!/usr/bin/env node
/**
 * Security Gate MCP server
 * Tools: handbrake_scan, project_profile, intel_refresh, layer2_brief, lab_bootstrap,
 *        deepsec_review, shannon_pentest, llamafirewall_advisor, semgrep_scan
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { runLabAction, startupSummaryLine } from "./lib/lab-bootstrap.mjs";
import { runDeepSecAction } from "./lib/deepsec.mjs";
import { runShannonAction } from "./lib/shannon.mjs";
import { runLlamaFirewallAction } from "./lib/llamafirewall-advisor.mjs";
import { runSemgrepAction } from "./lib/semgrep-scan.mjs";
import { runHandbrakeScan } from "./lib/handbrake.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");

function resolveWorkspaceRoot(input) {
  const fromArg = input?.workspaceRoot?.trim();
  if (fromArg) return path.resolve(fromArg);
  if (process.env.SECURITY_GATE_WORKSPACE?.trim()) {
    return path.resolve(process.env.SECURITY_GATE_WORKSPACE.trim());
  }
  return process.cwd();
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

async function readJsonIfExists(p) {
  try {
    const t = await fs.readFile(p, "utf8");
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function projectProfile(root) {
  const signals = {
    workspaceRoot: root,
    languages: [],
    frameworks: [],
    agentic: false,
    web: false
  };

  const addLang = (lang) => {
    if (!signals.languages.includes(lang)) signals.languages.push(lang);
  };
  const addFw = (fw) => {
    if (!signals.frameworks.includes(fw)) signals.frameworks.push(fw);
  };

  if (await pathExists(path.join(root, "package.json"))) {
    addLang("javascript");
    const pkgRaw = await readTextIfExists(path.join(root, "package.json"));
    let pkg = {};
    try {
      pkg = JSON.parse(pkgRaw || "{}");
    } catch {
      pkg = {};
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const depKeys = Object.keys(deps).map((k) => k.toLowerCase());

    if (depKeys.includes("next") || depKeys.some((k) => k.startsWith("@next/"))) addFw("next");
    if (depKeys.includes("react") || depKeys.some((k) => k.startsWith("react-") || k.startsWith("@react/"))) addFw("react");
    if (depKeys.some((k) => k.startsWith("@nestjs/"))) addFw("nestjs");
    if (depKeys.includes("express")) addFw("express");
    if (depKeys.includes("fastify")) addFw("fastify");
    if (depKeys.some((k) => k.includes("langchain"))) {
      addFw("langchain");
      signals.agentic = true;
    }
    if (depKeys.some((k) => k.startsWith("@modelcontextprotocol"))) addFw("mcp-sdk");
  }

  if (await pathExists(path.join(root, "requirements.txt"))) {
    addLang("python");
    const req = await readTextIfExists(path.join(root, "requirements.txt"));
    if (/streamlit/i.test(req)) addFw("streamlit");
    if (/langchain/i.test(req)) signals.agentic = true;
    if (/fastapi|flask|django/i.test(req)) signals.web = true;
  }

  if (await pathExists(path.join(root, "pyproject.toml"))) {
    addLang("python");
    const t = await readTextIfExists(path.join(root, "pyproject.toml"));
    if (/streamlit/i.test(t)) addFw("streamlit");
    if (/langchain/i.test(t)) signals.agentic = true;
    if (/fastapi|flask|django/i.test(t)) signals.web = true;
  }

  if (await pathExists(path.join(root, "go.mod"))) addLang("go");
  if (await pathExists(path.join(root, "Gemfile"))) addLang("ruby");

  if (signals.frameworks.some((f) => ["nestjs", "express", "fastify", "next", "fastapi", "flask", "django", "streamlit"].includes(f))) {
    signals.web = true;
  }

  const recommended_dynamic = signals.agentic ? "crucible" : signals.web ? "shannon" : "none";
  return { ...signals, recommended_dynamic_engine: recommended_dynamic };
}

async function ensureCacheDir(root) {
  const dir = path.join(root, ".security-gate", "cache");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "security-gate-mcp/0.1" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function refreshIntel(root, { maxPackages = 8 } = {}) {
  const cacheDir = await ensureCacheDir(root);
  const kevPath = path.join(cacheDir, "kev.json");
  const metaPath = path.join(cacheDir, "intel-meta.json");

  let kev = null;
  let kevError = null;
  try {
    kev = await fetchJson("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
  } catch (e) {
    kevError = String(e?.message || e);
  }

  if (kev) {
    await fs.writeFile(kevPath, JSON.stringify(kev, null, 2), "utf8");
  }

  const pkgPath = path.join(root, "package.json");
  const pkgRaw = await readTextIfExists(pkgPath);
  let deps = {};
  try {
    const pkg = JSON.parse(pkgRaw || "{}");
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    deps = {};
  }

  const names = Object.keys(deps).slice(0, maxPackages);
  const osvResults = [];
  for (const name of names) {
    const ver = deps[name];
    if (!ver || ver.startsWith("file:") || ver.startsWith("link:")) continue;
    const clean = ver.replace(/^[\^~>=<]/, "").split(" ")[0];
    try {
      const body = { package: { ecosystem: "npm", name }, version: clean };
      const r = await fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "security-gate-mcp/0.1" },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        osvResults.push({ name, version: clean, error: `HTTP ${r.status}` });
        continue;
      }
      const j = await r.json();
      osvResults.push({ name, version: clean, vulns: j.vulns?.length ?? 0, sample: (j.vulns || []).slice(0, 3) });
    } catch (e) {
      osvResults.push({ name, version: clean, error: String(e?.message || e) });
    }
  }

  const meta = {
    updated_at: new Date().toISOString(),
    workspaceRoot: root,
    sources: ["CISA KEV catalog", "OSV npm queries (subset)"],
    kev_error: kevError,
    note: "NVD enrichment is optional (set NVD_API_KEY) and not implemented in this MVP server build."
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  await fs.writeFile(path.join(cacheDir, "osv-samples.json"), JSON.stringify(osvResults, null, 2), "utf8");

  return { cacheDir, kevWritten: !!kev, kevError, osvPackages: osvResults.length };
}

/**
 * Build markdown lines for the CISA KEV section of layer2_brief.
 * KEV is downloaded in full by `intel_refresh` to `.security-gate/cache/kev.json`;
 * this summary is intentionally shallow (counts + sample CVE IDs) — not a per-package join with OSV in MVP.
 */
function kevBriefLines(kev, meta) {
  const lines = [];
  lines.push("### CISA KEV catalog (cached snapshot)");
  const lastErr = meta && typeof meta === "object" && meta.kev_error ? String(meta.kev_error) : null;

  if (!kev || typeof kev !== "object" || kev.error) {
    if (lastErr) {
      lines.push(`- KEV download failed on the last \`intel_refresh\`: \`${lastErr}\``);
      lines.push("- No usable `kev.json` snapshot. Retry when the network is available.");
    } else {
      lines.push("- No KEV snapshot on disk. Run MCP tool `intel_refresh`.");
    }
    return lines;
  }

  const vulns = Array.isArray(kev.vulnerabilities) ? kev.vulnerabilities : [];
  const n = typeof kev.count === "number" ? kev.count : vulns.length;
  const ver = kev.catalogVersion ?? "(unknown)";
  const released = kev.dateReleased ?? "(unknown)";
  lines.push(`- **Catalog version**: \`${ver}\`; **date released**: ${released}`);
  lines.push(`- **Entry count**: **${n}** (from CISA \`count\` or \`vulnerabilities.length\`)`);
  lines.push(
    "- **Scope note:** this is the **full** CISA catalog cached for triage context. In MVP it is **not auto-joined** row-by-row with OSV npm results below; use KEV to prioritize *known exploited* issues when overlaps appear."
  );
  const sample = vulns
    .slice(0, 3)
    .map((v) => (v && typeof v === "object" ? v.cveID || v.cveId : null))
    .filter(Boolean);
  if (sample.length) {
    lines.push(`- **Sample CVE IDs** (first rows in the feed, not tailored to this repo): ${sample.join(", ")}`);
  }
  lines.push("- Full JSON: `.security-gate/cache/kev.json`");
  if (lastErr) {
    lines.push(
      `- **Note:** last \`intel_refresh\` could not refresh KEV (\`${lastErr}\`); the summary above reflects the **previous** successful cache on disk.`
    );
  }
  return lines;
}

async function layer2Brief(root, { featureSummary = "" } = {}) {
  const cacheDir = path.join(root, ".security-gate", "cache");
  const osv = (await readJsonIfExists(path.join(cacheDir, "osv-samples.json"))) || [];
  const kev = await readJsonIfExists(path.join(cacheDir, "kev.json"));
  const intelMeta = await readJsonIfExists(path.join(cacheDir, "intel-meta.json"));
  const profile = await projectProfile(root);

  const lines = [];
  lines.push("## Evidence-first context for Layer 2 planning");
  lines.push("");
  lines.push(`Workspace: \`${root}\``);
  if (featureSummary) lines.push(`Feature focus: ${featureSummary}`);
  lines.push("");
  lines.push("### Detected stack signals");
  lines.push(`- Languages: ${profile.languages.join(", ") || "(none detected)"}`);
  lines.push(`- Frameworks: ${profile.frameworks.join(", ") || "(none detected)"}`);
  lines.push(`- Agentic signals: ${profile.agentic ? "yes" : "no"}`);
  lines.push(`- Suggested dynamic engine (if allowed): **${profile.recommended_dynamic_engine}**`);
  lines.push("");
  lines.push(...kevBriefLines(kev, intelMeta));
  lines.push("");
  lines.push("### Recent OSV query snapshot (subset, npm via package.json)");
  if (!osv.length) {
    lines.push(
      "- No OSV rows cached yet. Run MCP tool `intel_refresh` when this workspace has a **`package.json`** with npm `dependencies` / `devDependencies` (OSV queries are **npm-only** in MVP — not `package-lock.json`, PyPI, Rubygems, etc.)."
    );
  } else {
    for (const row of osv.slice(0, 12)) {
      if (row.error) lines.push(`- **${row.name}** @ ${row.version}: _${row.error}_`);
      else lines.push(`- **${row.name}** @ ${row.version}: ${row.vulns} OSV matches (showing up to 3 ids in JSON cache)`);
    }
  }
  lines.push("");
  lines.push("### Instructions for the model");
  lines.push("- Use this section as grounding. Do **not** invent CVE IDs beyond what appears in the cached JSON / tables above.");
  lines.push("- If you need more coverage, run `intel_refresh` and optionally add NVD-based enrichment in a future release.");
  lines.push("");
  return lines.join("\n");
}

const server = new McpServer({ name: "security-gate", version: "0.3.1" });

server.tool(
  "handbrake_scan",
  "Production safety handbrake: scans merged environment variables (process + workspace .env files) and blocks dynamic testing when production-like signals are present.",
  {
    workspaceRoot: z.string().optional().describe("Workspace root to scan for .env files (defaults to cwd or SECURITY_GATE_WORKSPACE)")
  },
  async (args) => {
    const root = resolveWorkspaceRoot(args);
    const result = await runHandbrakeScan(root);
    const text = JSON.stringify(result, null, 2);
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "project_profile",
  "Detect coarse stack signals from the repository (package manifests).",
  {
    workspaceRoot: z.string().optional().describe("Workspace root (defaults to cwd or SECURITY_GATE_WORKSPACE)")
  },
  async (args) => {
    const root = resolveWorkspaceRoot(args);
    const profile = await projectProfile(root);
    return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
  }
);

server.tool(
  "intel_refresh",
  "Refresh local intel cache: downloads CISA KEV JSON and runs a small set of OSV queries for npm dependencies (MVP).",
  {
    workspaceRoot: z.string().optional().describe("Workspace root"),
    maxPackages: z.number().int().positive().max(50).optional().describe("Max npm dependencies to query (default 8)")
  },
  async (args) => {
    const root = resolveWorkspaceRoot(args);
    const maxPackages = args.maxPackages ?? 8;
    const summary = await refreshIntel(root, { maxPackages });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ workspaceRoot: root, ...summary }, null, 2)
        }
      ]
    };
  }
);

server.tool(
  "layer2_brief",
  "Build a short, evidence-first markdown brief for Layer 2 planning: stack profile + cached CISA KEV snapshot (from kev.json) + OSV npm subset (from osv-samples.json). KEV is not auto-joined with OSV rows in MVP.",
  {
    workspaceRoot: z.string().optional().describe("Workspace root"),
    featureSummary: z.string().optional().describe("Short description of the feature being implemented")
  },
  async (args) => {
    const root = resolveWorkspaceRoot(args);
    const md = await layer2Brief(root, { featureSummary: args.featureSummary || "" });
    return { content: [{ type: "text", text: md }] };
  }
);

server.tool(
  "deepsec_review",
  "Tier-3 deep review (Vercel Labs DeepSec) host wrapper. Detects Node 22+, pnpm, .deepsec/ scaffold and credentials (AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN / ANTHROPIC_AUTH_TOKEN). Never auto-runs scans; the caller must pass action=scan explicitly. Default scan limit is conservative (50) to keep cost bounded.",
  {
    action: z
      .enum(["status", "install_plan", "init", "scan", "report"])
      .optional()
      .default("status")
      .describe(
        "status = detection only; install_plan = copy-paste install hints; init = scaffold .deepsec/; scan = pnpm deepsec scan + process; report = export markdown findings"
      ),
    workspaceRoot: z
      .string()
      .optional()
      .describe("Workspace where DeepSec scaffolds .deepsec/ (defaults to cwd or SECURITY_GATE_WORKSPACE)"),
    limit: z
      .number()
      .int()
      .positive()
      .max(500)
      .optional()
      .describe("Files to include in `pnpm deepsec scan --limit`. Default 50 (calibration). Max 500.")
  },
  async (args) => {
    const workspaceRoot = resolveWorkspaceRoot(args);
    const action = args.action ?? "status";
    const limit = args.limit;
    const payload = runDeepSecAction({ workspaceRoot, action, limit });
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.tool(
  "semgrep_scan",
  "OSS Semgrep wrapper (Community Edition). Bundled inside Security Gate because the official `ghcr.io/semgrep/mcp` server was deprecated in Semgrep v0.9.0 (now only exposes a `deprecation_notice` tool) and the `semgrep mcp` subcommand requires the proprietary Pro Engine. Resolution order: host `semgrep` binary first, Docker `semgrep/semgrep:latest` fallback. Exit code 0 = no findings, exit code 1 = findings present — both are treated as success. Use for the workspace rule that pre-flights generated code with Semgrep.",
  {
    action: z
      .enum(["status", "scan_path", "scan_text"])
      .optional()
      .default("status")
      .describe("status = engine detection; scan_path = scan a file or directory; scan_text = scan an inline snippet (writes a tempfile)"),
    workspaceRoot: z.string().optional().describe("Workspace root used as default scan target when target_path is omitted"),
    target_path: z.string().optional().describe("File or directory to scan (defaults to workspaceRoot). Must contain ≤ 5000 files."),
    config: z.string().optional().describe("Semgrep --config value (default `p/ci`). Examples: `p/ci`, `p/owasp-top-ten`, `p/r2c-security-audit`, `p/python`, `p/javascript`. The Semgrep `auto` config requires metrics opt-in and we honor that automatically when you pass it explicitly."),
    extra_args: z.array(z.string()).optional().describe("Extra args appended after --json (use sparingly; the wrapper already passes --quiet --metrics=off)."),
    snippet: z.string().optional().describe("Inline code to scan (only with action=scan_text). Max 200 KB."),
    language: z
      .enum(["javascript", "typescript", "python", "go", "java", "ruby", "php", "c", "cpp", "csharp", "kotlin", "rust"])
      .optional()
      .describe("Language hint for scan_text — controls the tempfile extension Semgrep uses to pick rules.")
  },
  async (args) => {
    const workspaceRoot = resolveWorkspaceRoot(args);
    const action = args.action ?? "status";
    const payload = runSemgrepAction({
      action,
      workspaceRoot,
      target_path: args.target_path,
      config: args.config,
      extra_args: args.extra_args,
      snippet: args.snippet,
      language: args.language
    });
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.tool(
  "shannon_pentest",
  "Tier-2 dynamic web/API pentest (KeygraphHQ Shannon) host wrapper. Detects Docker, Node 18+, Anthropic-compatible credentials, and classifies the target URL as disposable-or-not. Never auto-runs pentests; the caller must pass action=pentest with an explicit target_url. Anthropic-compatible proxies (OpenRouter, Vercel AI Gateway) supported via ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL.",
  {
    action: z
      .enum(["status", "install_plan", "setup", "pentest", "report"])
      .optional()
      .default("status")
      .describe(
        "status = detection only; install_plan = copy-paste install hints; setup = npx @keygraph/shannon setup; pentest = npx @keygraph/shannon start (gated); report = list Shannon output files"
      ),
    workspaceRoot: z.string().optional().describe("Workspace (defaults to cwd or SECURITY_GATE_WORKSPACE)"),
    target_url: z.string().optional().describe("Pentest target URL. Must point to a disposable / containerized environment."),
    repo_path: z.string().optional().describe("Path to the source repo Shannon should analyze (defaults to workspaceRoot)."),
    dryRun: z.boolean().optional().describe("When true with action=pentest, returns the planned command without spawning it.")
  },
  async (args) => {
    const workspaceRoot = resolveWorkspaceRoot(args);
    const action = args.action ?? "status";
    const payload = runShannonAction({
      workspaceRoot,
      action,
      targetUrl: args.target_url,
      repoPath: args.repo_path,
      dryRun: args.dryRun === true
    });
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.tool(
  "llamafirewall_advisor",
  "Tier-2.5 runtime defense ADVISOR for Meta's LlamaFirewall (Python). Detects whether the workspace looks agentic, whether llamafirewall is already declared/importable, and returns an install plan + copy-paste Python snippet. NEVER installs anything and NEVER modifies user files — LlamaFirewall must live inside the user's agent process, not in Security Gate.",
  {
    action: z
      .enum(["status", "install_plan", "snippet"])
      .optional()
      .default("status")
      .describe("status = detection only; install_plan = Python 3.10+ + pip + venv steps; snippet = copy-paste integration code"),
    workspaceRoot: z.string().optional().describe("Workspace (defaults to cwd or SECURITY_GATE_WORKSPACE)")
  },
  async (args) => {
    const workspaceRoot = resolveWorkspaceRoot(args);
    const action = args.action ?? "status";
    const payload = runLlamaFirewallAction({ workspaceRoot, action });
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.tool(
  "lab_bootstrap",
  "One-click scanner lab: detects Docker/Python, returns an OS-specific install plan when missing, and can start/stop an isolated Docker Compose stack (semgrep-lab + crucible-lab) that bind-mounts the workspace. Does not auto-install privileged system software; use install_plan output in your terminal. Always run handbrake_scan before any live exploitation. Post-MVP: stack-scaffold templates (Node/Python, etc.) keyed by project_profile — see docs/ROADMAP.md.",
  {
    action: z
      .enum(["status", "start", "stop", "install_plan"])
      .optional()
      .default("status")
      .describe("status = probe only; start = docker compose up -d --build; stop = docker compose down; install_plan = copy-paste install hints only"),
    workspaceRoot: z.string().optional().describe("Workspace to bind-mount into scanner containers (defaults to cwd or SECURITY_GATE_WORKSPACE)"),
    autoStartIfReady: z
      .boolean()
      .optional()
      .describe("When true with action=status, automatically runs start if Docker is available but the lab stack is not running")
  },
  async (args) => {
    const workspaceRoot = resolveWorkspaceRoot(args);
    const action = args.action ?? "status";
    const autoStartIfReady = args.autoStartIfReady === true;
    const payload = runLabAction({
      repoRoot: PLUGIN_ROOT,
      workspaceRoot,
      action,
      autoStartIfReady
    });
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

const _boot = startupSummaryLine({ repoRoot: PLUGIN_ROOT, workspaceRoot: resolveWorkspaceRoot({}) });
try {
  process.stderr.write(`${_boot.text}\n`);
} catch {
  // ignore
}

const transport = new StdioServerTransport();
await server.connect(transport);
