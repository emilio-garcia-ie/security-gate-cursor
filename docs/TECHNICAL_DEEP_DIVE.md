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

This repo exposes Semgrep through the bundled MCP tool **`semgrep_scan`** (OSS, no Pro Engine):

```jsonc
// agent calls
{ "name": "semgrep_scan", "arguments": { "action": "status" } }
{ "name": "semgrep_scan", "arguments": { "action": "scan_path", "target_path": ".", "config": "p/owasp-top-ten" } }
{ "name": "semgrep_scan", "arguments": { "action": "scan_text", "snippet": "<code>", "language": "python" } }
```

Manual host invocation (CLI, same engine):

```bash
semgrep scan --config p/ci --metrics=off .
```

Why the wrapper exists: Semgrep's `semgrep mcp` subcommand requires the **proprietary Pro Engine** (paid AppSec Platform). The standalone OSS Docker image `ghcr.io/semgrep/mcp` was deprecated in v0.9.0 and now only exposes a `deprecation_notice` tool. Security Gate bundles a thin wrapper so the OSS path stays usable and satisfies the workspace `semgrep_scan` rule.

**Docker lab (optional):** MCP tool **`lab_bootstrap`** can start **`semgrep-lab`** inside `docker-compose.lab.yml` so Semgrep runs in a container with the workspace bind-mounted (see `SETUP.md` → Scanner lab).

## Shannon — wired through `shannon_pentest`

Shannon is an autonomous web/API pentester from KeygraphHQ (open-source Lite edition, AGPL-3.0). The MCP tool **`shannon_pentest`** wraps it with the same defensive pattern used for DeepSec:

- `action=status` → detects Docker, Node 18+, Anthropic-compatible credentials, and classifies the target URL (host on local allowlist / suspicious / clearly production).
- `action=install_plan` → returns OS-specific Docker + Node install commands plus the Anthropic / OpenRouter / Vercel AI Gateway credential options.
- `action=setup` → runs `npx --yes @keygraph/shannon setup`.
- `action=pentest target_url=... [repo_path=...] [dryRun=true]` → runs `npx --yes @keygraph/shannon start -u <target> -r <repo>`. **Refuses** production-looking hostnames (regex `/prod|production|live|admin|internal/`) and missing credentials. `dryRun` returns the planned command without spawning it.
- `action=report` → lists files under `<workspace>/.shannon/` (best effort; check Shannon's vendor docs for the canonical layout).

Credential modes:
- Native: `ANTHROPIC_API_KEY`.
- Proxy (free OpenRouter / Vercel AI Gateway): `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` (e.g. `https://openrouter.ai/api/v1`). See [`FREE_VS_PAID_LLM.md`](FREE_VS_PAID_LLM.md) §3.2.

## LlamaFirewall — wired through `llamafirewall_advisor`

LlamaFirewall is a Python **runtime** library that must live inside the user's agent process. Security Gate treats it as an **advisor**:

- `action=status` → reads `requirements.txt` / `pyproject.toml` / `setup.cfg` for agentic hints (langchain / langgraph / openai / llama_index / crewai / autogen / smolagents / haystack / guidance / generic `llm`), then probes whether `llamafirewall` is declared or importable.
- `action=install_plan` → Python 3.10+ install, venv creation, `pip install "llamafirewall>=1.0.3,<2"`. The first import downloads Meta's Prompt Guard 2 model from Hugging Face — flag this to the user.
- `action=snippet` → returns a ready-to-paste Python block (`PromptGuardScanner` + `CodeShieldScanner`).

The advisor never installs or executes anything. Pretending to "run LlamaFirewall" from outside the user's process would misrepresent how the library works.

## Crucible (Tier 2 agentic)

Never run these against production systems.

Operational requirements:

- Shannon: follow vendor guidance — **disposable environment** + seed data.
- Crucible: host install via `pip install crucible-security`, **or** the **`crucible-lab`** service from `docker-compose.lab.yml` (started by MCP **`lab_bootstrap`**). Always treat targets as disposable.

## DeepSec (Tier 3) — wired through `deepsec_review`

Treat DeepSec as **deep review**, not “live exploitation”. The MCP tool **`deepsec_review`** wraps the vendor CLI conservatively:

- `action=status` → detects Node 22+, pnpm (via corepack), `.deepsec/` scaffold and credentials.
- `action=install_plan` → returns OS-specific commands to install Node 22+, enable pnpm via `corepack`, and acquire one of `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` / `ANTHROPIC_AUTH_TOKEN`.
- `action=init` → runs `npx --yes deepsec@latest init` and `pnpm install` inside `.deepsec/`.
- `action=scan` → executes `pnpm deepsec scan --limit <N>` (default **50**, max **500**) + `pnpm deepsec process`. **Never** auto-runs; the caller must pass `action=scan` explicitly. Refuses to start when no credential is detected.
- `action=report` → exports markdown findings via `pnpm deepsec export --format md-dir --out ./findings`.

Cost calibration is mandatory — DeepSec uses Anthropic-class models. Per the vendor FAQ, an Opus-default pass over ~100 files is roughly $25–60 (verify against current DeepSec pricing — **Confidence: Med**).

## Hooks

`hooks/hooks.json` registers a `sessionStart` command hook.

**Confidence: Med** — hook JSON schemas can vary by Cursor version. If a hook fails to load, remove the `hooks` section from `.cursor-plugin/plugin.json` temporarily and rely on MCP-only workflow.

## OWASP & ISO 27001 alignment (practical, not certification)

This repo can generate **review-friendly artifacts** if you:

- store `intel_refresh` outputs under `.security-gate/cache/`
- store `handbrake_scan` results in your ticket system
- ask the agent to tag each finding with **one** framework reference (OWASP Top 10 / API / LLM / Agentic, or ISO/IEC 27001:2022 Annex A control such as **A.8.8**, **A.8.25**, **A.8.28**, **A.8.29**, **A.8.31**)

The consolidated qualitative mapping lives in [`STANDARDS_MAPPING.md`](STANDARDS_MAPPING.md). This is **evidence support**, not a compliance certification.

## CI/CD suggestions

- Run `semgrep` in CI on pull requests.
- Fail builds on `ERROR` / `CRITICAL` findings (tune gradually).
- Do not run dynamic exploit tooling in CI unless you maintain a dedicated lab environment.
