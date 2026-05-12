/**
 * Production safety handbrake: merge workspace .env* with process.env and detect production-like signals.
 * Extracted for reuse by MCP `handbrake_scan`, export scripts, and benchmarks.
 */
import fs from "node:fs/promises";
import path from "node:path";

export const BLOCK_MESSAGE =
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

async function readTextIfExists(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

export function parseDotEnv(text) {
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

export async function loadWorkspaceEnvFiles(root) {
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

export function mergeEnv(fileEnv) {
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
  if (/prod(uction)?/.test(n)) return true;
  if (/(^|[-_])live($|[-_])/.test(n)) return true;
  if (/main[-_]?db/.test(n)) return true;
  return false;
}

export function productionHandbrake(env) {
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

/**
 * @param {string} workspaceRoot Absolute or resolved workspace path
 * @returns {Promise<object>} Same shape as MCP `handbrake_scan` JSON body
 */
export async function runHandbrakeScan(workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  const fileEnv = await loadWorkspaceEnvFiles(root);
  const merged = mergeEnv(fileEnv);
  const result = productionHandbrake(merged);
  return { workspaceRoot: root, ...result };
}
