# Security Gate — Technical Deep Dive (English)

## Related staged documents

- [`STAGE_01_STRATEGY_AND_ARCHITECTURE.md`](STAGE_01_STRATEGY_AND_ARCHITECTURE.md) — product thesis, architecture matrix, competitive framing  
- [`STAGE_02_TECHNICAL_DESIGN_AND_COSTS.md`](STAGE_02_TECHNICAL_DESIGN_AND_COSTS.md) — coverage tables, costs, handbrake pseudocode, RAG design  
- [`HACKATHON_FINAL_REPORT.md`](HACKATHON_FINAL_REPORT.md) — consolidated submission-style report

## Portability (macOS / Windows / Linux)

The MCP server and smoke harness are **Node-only** and use `path.join` / `path.resolve` for filesystem paths. Hooks invoke `node` with a repo-relative script path (works on all platforms when Node is on `PATH`). Docker workflows assume **Docker Desktop** (macOS/Windows) or **Docker Engine + Compose v2** (Linux); `lab_bootstrap` emits OS-keyed install hints (`darwin`, `windows`, `linux`). Demo repositories are cloned via **`npm run clone-demo-targets`** (Node + git) or the Bash helper script.

## Architecture (hybrid plugin)

This plugin intentionally combines:

- **Rules** in `rules/` (Layer 1)
- **Skills** in `skills/` (operational guidance for agents)
- **Hooks** in `hooks/` (lightweight session hints)
- **MCP** in `mcp-server/` (Layer 3 orchestration primitives)

Cursor’s plugin model is naturally **hybrid**: distribution is unified, while responsibilities stay separated.

## MCP server execution model

The MCP server uses **stdio** transport (`@modelcontextprotocol/sdk`).

Workspace resolution order:

1. Tool argument `workspaceRoot` (if provided)
2. Environment variable `SECURITY_GATE_WORKSPACE`
3. `process.cwd()` (typically the opened workspace root in Cursor)

## Production safety handbrake (implementation notes)

Source of truth: `mcp-server/index.mjs`.

Design goals:

- **Fail closed for dynamic testing** only when strong production-like signals exist.
- Keep **Tier 1 static analysis** available because it does not attack running systems.

### Heuristics (MVP)

- `NODE_ENV=production` → block dynamic
- `ENV` / `RAILS_ENV` production-like → block dynamic
- `PRODUCTION=true` → block dynamic
- Database URLs: parse host/name heuristically; allow common local/dev/docker service hostnames

**Known false positives/negatives**: environment detection is inherently heuristic. Treat this as guardrails for demos + developer workstations, not a cloud security boundary.

## Intel refresh (MVP)

`intel_refresh` currently:

- Downloads **CISA KEV** JSON (full catalog). On success, writes `kev.json` under `.security-gate/cache/`; on failure, leaves any prior snapshot untouched and records `kev_error` in `intel-meta.json` plus the tool JSON response.
- Runs **OSV** queries for the first **N** npm package names from merged **`package.json`** `dependencies` / `devDependencies` only (**N** = `maxPackages`, default **8**, cap **50**). Results are written to `osv-samples.json`. Lockfiles and non-npm ecosystems are out of scope for this MVP build.
- Writes **`intel-meta.json`** (`updated_at`, `workspaceRoot`, `sources`, `kev_error`, optional note).

### `layer2_brief` (MVP)

Reads the same cache directory plus **`project_profile`**, and returns markdown that includes:

- Detected stack signals and suggested dynamic engine label.
- **CISA KEV** subsection (catalog version, date, entry count, sample CVE IDs from the feed head, path to `kev.json`, and guidance when cache or last refresh failed).
- **OSV** subsection (subset rows from `osv-samples.json`).

**Important:** the brief does **not** correlate KEV entries with individual OSV package rows automatically; planners use both sources side by side.

### NVD (recommended extension)

NVD enrichment is intentionally **not** fully implemented in the MVP server to avoid shipping a half-baked poller. Recommended approach for production iteration:

- Use NVD 2.0 API with `NVD_API_KEY`
- Store normalized records in `.security-gate/cache/nvd.json`
- Join OSV/CPE findings to your dependency inventory

## Semgrep (Tier 1)

This repo does not invoke Semgrep automatically (to avoid surprising users). Recommended invocation:

```bash
semgrep --config auto .
```

**Docker lab (optional):** MCP tool **`lab_bootstrap`** can start **`semgrep-lab`** inside `docker-compose.lab.yml` so Semgrep runs in a container with the workspace bind-mounted (see `SETUP.md` → Scanner lab).

## Shannon / Crucible (Tier 2)

Never run these against production systems.

Operational requirements:

- Shannon: follow vendor guidance — **disposable environment** + seed data.
- Crucible: host install via `pip install crucible-security`, **or** the **`crucible-lab`** service from `docker-compose.lab.yml` (started by MCP **`lab_bootstrap`**). Always treat targets as disposable.

## DeepSec (Tier 3)

Treat DeepSec as **deep review**, not “live exploitation”. Calibrate costs using vendor guidance (example: start with small limits / sampling).

## Hooks

`hooks/hooks.json` registers a `sessionStart` command hook.

**Confidence: Med** — hook JSON schemas can vary by Cursor version. If a hook fails to load, remove the `hooks` section from `.cursor-plugin/plugin.json` temporarily and rely on MCP-only workflow.

## ISO 27001 alignment (practical, not certification)

This repo can generate **audit-friendly artifacts** if you:

- store `intel_refresh` outputs under `.security-gate/cache/`
- store `handbrake_scan` results in your ticket system
- map findings to Annex A controls qualitatively (e.g., A.8.x technical vulnerabilities management)

This is **evidence support**, not a compliance certification.

## CI/CD suggestions

- Run `semgrep` in CI on pull requests.
- Fail builds on `ERROR` / `CRITICAL` findings (tune gradually).
- Do not run dynamic exploit tooling in CI unless you maintain a dedicated lab environment.
