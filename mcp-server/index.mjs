#!/usr/bin/env node
/**
 * Security Gate MCP server
 * Tools: handbrake_scan, project_profile, intel_refresh, layer2_brief, lab_bootstrap
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { runLabAction, startupSummaryLine } from "./lib/lab-bootstrap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");

const BLOCK_MESSAGE =
  "Production environment detected. Live exploit testing has been disabled to protect your data. Only static analysis (Tier 1) is available.";

const DEV_DB_HOST_ALLOWLIST = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "mysql",
  "postgres",
  "mongo",
  "mariadb",
  "db",
  "redis"
]);

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

function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function loadWorkspaceEnvFiles(root) {
  const names = [".env", ".env.local", ".env.production", ".env.production.local", ".env.development.local"];
  const merged = {};
  for (const n of names) {
    const p = path.join(root, n);
    const txt = await readTextIfExists(p);
    if (!txt) continue;
    Object.assign(merged, parseDotEnv(txt));
  }
  return merged;
}

function mergeEnv(fileEnv) {
  return { ...fileEnv, ...process.env };
}

function normalizeHost(host) {
  if (!host) return "";
  return host.toLowerCase().replace(/^\[|\]$/g, "");
}

function tryParseDbHost(databaseUrl) {
  if (!databaseUrl) return { host: "", dbName: "" };
  const u = databaseUrl.trim();
  try {
    const url = new URL(u.replace(/^jdbc:/, ""));
    return {
      host: normalizeHost(url.hostname),
      dbName: (url.pathname || "").replace(/^\//, "").split("/")[0] || ""
    };
  } catch {
    const mHost = u.match(/@([^/:?]+)(?::\d+)?(?:\/|$|\?)/);
    const mDb = u.match(/\/([^/?]+)(?:\?|$)/);
    return {
      host: normalizeHost(mHost?.[1] || ""),
      dbName: mDb?.[1] || ""
    };
  }
}

function looksLikeProdDbName(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  // "prod"/"production" matched anywhere: guardrail prefers false-positives over misses
  // (e.g., "myappprod", "app_prod_v2", "prod1" must all be blocked).
  if (/prod(uction)?/.test(n)) return true;
  // "live" must be separator-bounded to avoid matching unrelated words like
  // "alive", "delivery", "relive".
  if (/(^|[-_])live($|[-_])/.test(n)) return true;
  // main-db / main_db / maindb / mainDB (lowercased).
  if (/main[-_]?db/.test(n)) return true;
  return false;
}

function productionHandbrake(env) {
  const reasons = [];
  const e = (k) => (env[k] ?? "").toString().trim();

  if (/^production$/i.test(e("NODE_ENV"))) reasons.push("NODE_ENV is production");
  if (/^prod(uction)?$/i.test(e("ENV"))) reasons.push("ENV indicates production");
  if (/^production$/i.test(e("RAILS_ENV"))) reasons.push("RAILS_ENV is production");
  if (/^true$/i.test(e("PRODUCTION"))) reasons.push("PRODUCTION is true");

  const dbUrl = e("DATABASE_URL") || e("DB_URL") || e("MYSQL_URL") || e("POSTGRES_URL");
  if (dbUrl) {
    const { host, dbName } = tryParseDbHost(dbUrl);
    if (host && !DEV_DB_HOST_ALLOWLIST.has(host)) {
      reasons.push(`Database host "${host}" is not in the local/dev allowlist`);
    }
    if (looksLikeProdDbName(dbName)) {
      reasons.push(`Database name "${dbName}" looks production-like`);
    }
  }

  const dynamicAllowed = reasons.length === 0;
  return {
    dynamic_allowed: dynamicAllowed,
    tier1_static_allowed: true,
    user_message: dynamicAllowed ? "" : BLOCK_MESSAGE,
    reasons,
    scanned_keys: [
      "NODE_ENV",
      "ENV",
      "RAILS_ENV",
      "PRODUCTION",
      "DATABASE_URL",
      "DB_URL",
      "MYSQL_URL",
      "POSTGRES_URL"
    ]
  };
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

const server = new McpServer({ name: "security-gate", version: "0.1.1" });

server.tool(
  "handbrake_scan",
  "Production safety handbrake: scans merged environment variables (process + workspace .env files) and blocks dynamic testing when production-like signals are present.",
  {
    workspaceRoot: z.string().optional().describe("Workspace root to scan for .env files (defaults to cwd or SECURITY_GATE_WORKSPACE)")
  },
  async (args) => {
    const root = resolveWorkspaceRoot(args);
    const fileEnv = await loadWorkspaceEnvFiles(root);
    const merged = mergeEnv(fileEnv);
    const result = productionHandbrake(merged);
    const text = JSON.stringify({ workspaceRoot: root, ...result }, null, 2);
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
