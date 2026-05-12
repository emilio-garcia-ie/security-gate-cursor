#!/usr/bin/env node
/**
 * Export a markdown final security report from local workspace state (no network).
 * Usage: node scripts/export-final-report.mjs [--workspace DIR] [--locale en|es]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHandbrakeScan } from "../mcp-server/lib/handbrake.mjs";
import { runSemgrepAction } from "../mcp-server/lib/semgrep-scan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

function parseArgs(argv) {
  let workspace = process.cwd();
  let locale = "en";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workspace" && argv[i + 1]) {
      workspace = path.resolve(argv[++i]);
    } else if (a.startsWith("--workspace=")) {
      workspace = path.resolve(a.split("=", 2)[1]);
    } else if (a.startsWith("--locale=")) {
      locale = a.split("=", 2)[1] === "es" ? "es" : "en";
    }
  }
  return { workspace, locale };
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function intelBlock(workspace) {
  const cacheDir = path.join(workspace, ".security-gate", "cache");
  if (!fs.existsSync(cacheDir)) {
    return "_No `.security-gate/cache/` directory yet. Run MCP `intel_refresh` when online._";
  }
  const names = fs.readdirSync(cacheDir);
  const lines = ["Files present:", ...names.map((n) => `- \`${n}\``)];
  const meta = readJson(path.join(cacheDir, "intel-meta.json"));
  if (meta) lines.push("", "```json", JSON.stringify(meta, null, 2).slice(0, 4000), "```");
  return lines.join("\n");
}

function projectBlock(workspace) {
  const pkgPath = path.join(workspace, "package.json");
  if (!fs.existsSync(pkgPath)) return "_No `package.json` at workspace root._";
  const pkg = readJson(pkgPath);
  if (!pkg) return "_Could not parse package.json._";
  return ["- **name:** `" + (pkg.name || "") + "`", "- **version:** `" + (pkg.version || "") + "`"].join("\n");
}

async function main() {
  const { workspace, locale } = parseArgs(process.argv.slice(2));
  const templatePath = path.join(REPO, "docs", "templates", "FINAL_SECURITY_REPORT.template.md");
  let tpl = fs.readFileSync(templatePath, "utf8");

  const handbrake = await runHandbrakeScan(workspace);
  const handJson = JSON.stringify(handbrake, null, 2);

  const scanTarget = fs.existsSync(path.join(workspace, "mcp-server"))
    ? path.join(workspace, "mcp-server")
    : workspace;
  const semgrep = runSemgrepAction({
    action: "scan_path",
    workspaceRoot: workspace,
    target_path: scanTarget,
    config: "p/ci",
    extra_args: undefined,
    snippet: undefined,
    language: undefined
  });

  const semgrepMd =
    semgrep.ok === false
      ? `_Semgrep skipped: ${semgrep.blocked_reason || "unknown"}_`
      : [
          `- **engine:** ${semgrep.engine}`,
          `- **elapsed_ms:** ${semgrep.elapsed_ms ?? "n/a"}`,
          `- **findings_present:** ${semgrep.findings_present}`,
          `- **unique rules (check_id):** ${semgrep.scan_meta?.unique_check_ids ?? "n/a"}`,
          "",
          "```json",
          JSON.stringify({ exit_code: semgrep.exit_code, summary: semgrep.summary }, null, 2).slice(0, 12000),
          "```"
        ].join("\n");

  const execSummary =
    locale === "es"
      ? `Entorno dinámico permitido: **${handbrake.dynamic_allowed ? "sí" : "no"}**. Hallazgos Semgrep (muestra acotada): **${semgrep.summary?.total_findings ?? 0}**.`
      : `Dynamic testing allowed: **${handbrake.dynamic_allowed ? "yes" : "no"}**. Semgrep findings (bounded path): **${semgrep.summary?.total_findings ?? 0}**.`;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(workspace, ".security-gate", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `FINAL_SECURITY_REPORT_${ts}.md`);

  tpl = tpl
    .replace("{{GENERATED_AT}}", new Date().toISOString())
    .replace("{{WORKSPACE}}", workspace)
    .replace("{{EXEC_SUMMARY}}", execSummary)
    .replace("{{HANDBRAKE_JSON}}", handJson)
    .replace("{{PROJECT_BLOCK}}", projectBlock(workspace))
    .replace("{{INTEL_BLOCK}}", intelBlock(workspace))
    .replace("{{SEMGREP_BLOCK}}", semgrepMd);

  fs.writeFileSync(outFile, tpl, "utf8");
  console.log(JSON.stringify({ ok: true, written: outFile, workspace }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
