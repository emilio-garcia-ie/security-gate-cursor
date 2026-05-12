# Security Gate — Roadmap (English)

## Shipped as of v0.3.2 (current)

- Plugin manifest + rules + skill + hooks (`sessionStart` hint)
- MCP tools: `handbrake_scan`, `project_profile`, `intel_refresh`, `layer2_brief`, **`lab_bootstrap`** (OS-keyed install plan + isolated `docker-compose.lab.yml` stack: Semgrep + Crucible CLI image), **`deepsec_review`** (host wrapper for Vercel Labs DeepSec — Tier-3 deep review with safe `--limit` defaults and explicit credential gating), **`shannon_pentest`** (host wrapper for KeygraphHQ Shannon — Tier-2 dynamic web/API pentest with target classification + Anthropic-compatible proxy support), **`llamafirewall_advisor`** (read-only advisor for Meta LlamaFirewall — detection + install plan + Python integration snippet), **`semgrep_scan`** (bundled OSS Semgrep wrapper — host CE binary first, Docker `semgrep/semgrep:latest` fallback; satisfies the workspace `semgrep_scan` rule without Pro Engine)
- Standards mapping doc (`docs/STANDARDS_MAPPING.md`) covering OWASP Top 10 (web/API/LLM/Agentic) and ISO/IEC 27001:2022 Annex A — qualitative, not certification
- Free-vs-paid LLM matrix (`docs/FREE_VS_PAID_LLM.md`) with Ollama / Gemini / OpenRouter free / Groq free / Anthropic paid trade-offs, including OpenRouter Anthropic-compatible wiring for Shannon and DeepSec
- **`intel_refresh`**: writes `.security-gate/cache/kev.json` (full CISA KEV on success), `intel-meta.json` (includes `kev_error` when the KEV download fails), `osv-samples.json` (npm OSV query results for up to `maxPackages` names from **`package.json`**, default 8, max 50)
- **`layer2_brief`**: markdown from stack profile + cached **KEV** summary + **OSV** rows; **MVP** does not auto-join KEV to each OSV package row
- Docker Compose: **demo targets** (`docker-compose.yml`) + **scanner lab** (`docker-compose.lab.yml`)
- Cross-platform demo clone: `npm run clone-demo-targets` + Bash script alternative; **`npm run demo:up` / `npm run demo:down`** start/stop demo containers with **auto-selected free host ports** and printed URLs
- Documentation split: vibecoder vs technical; **`SETUP.md`** (install + **which Cursor workspace** drives `${workspaceFolder}` for MCP); **`docs/TROUBLESHOOTING.md`** (MCP missing, hooks, smoke failures, Docker lab); hackathon staged docs (`STAGE_01`, `STAGE_02`, `HACKATHON_FINAL_REPORT`, `API_KEY_ACQUISITION`)
- MCP smoke regression harness (`mcp-server/scripts/smoke*.mjs`, `npm run smoke:all`; optional `npm run smoke:intel` for sequential live **`intel_refresh` → `layer2_brief`** over MCP stdio, requires HTTPS)
- **One-click onboarding**: `npm run onboard` (`scripts/onboard.mjs`) — Node check, optional Docker/Semgrep hints, `mcp-server` install, local plugin symlink; `--locale=es` / `SECURITY_GATE_LOCALE` for Spanish CLI copy; `--keys` / `--keys-profile` for non-interactive key guidance
- **Handbrake module**: `mcp-server/lib/handbrake.mjs` shared by MCP and export scripts
- **Exportable final report**: `npm run report:export` → `.security-gate/reports/FINAL_SECURITY_REPORT_*.md` from `docs/templates/FINAL_SECURITY_REPORT.template.md`
- **Demo benchmark**: `npm run benchmark:demo` compares raw Semgrep vs bundled wrapper + handbrake (writes `.security-gate/reports/benchmark-latest.md` when the engine is available)
- **Semgrep scan metadata**: `semgrep_scan` path responses include `elapsed_ms` and `scan_meta` (version, unique rule ids, paths scanned, engine errors)
- **Tool × keys matrix**: `docs/LLM_AND_KEYS_MATRIX.md` (canonical env names; links from onboarding and rules)

## Post-MVP: stack-scaffold templates + `lab_bootstrap` (planned)

**Goal:** after `project_profile` detects coarse stack signals (Node, Python, …), offer **curated disposable lab scaffolds** (compose templates / base images) instead of only the single Semgrep + Crucible `docker-compose.lab.yml` bundle.

**Scope sketch:**

- Map `project_profile` outputs to **template keys** (e.g. `node`, `python`, `mixed`) with versioned compose fragments under something like `docker/lab/templates/` (not shipped in MVP).
- Extend **`lab_bootstrap`** with optional `profile` / `template` arguments (or a separate tool) that selects compose file + env; still **bind-mount** workspace, still require **`handbrake_scan`** before dynamic work.
- Document **host port** conventions per template; keep defaults conflict-free (root `docker-compose.yml`: `SECURITY_GATE_WEBAPP_PORT` default **23000**, `SECURITY_GATE_AGENT_PORT` default **18501**).

**Non-goals:** auto-provision cloud infra; “detect app type and magically run exploits”; production deployments.

## Next (high value)

- **NVD join**: ingest NVD/CVE data with `NVD_API_KEY`, normalize, and cross-link OSV results (today the server only documents the idea in `intel-meta.json`; no NVD HTTP client shipped)
- **Better inventory parsing**: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `requirements.txt` hashes
- **Semgrep SARIF post-processing**: extend `semgrep_scan` with `output_format=sarif` for IDE diagnostics surfaces, OWASP/CWE tagging, and findings dedup across runs
- **DeepSec depth controls**: structured SARIF/markdown post-processing of `.deepsec/findings/`, automatic OWASP/ISO tagging, and a `revalidate` action to reduce false positives
- **Optional Semgrep Pro passthrough**: detect a Pro-licensed `semgrep` binary and surface cross-file / supply-chain / secrets rulesets through `semgrep_scan` (no auto-install, no key leakage)
- **Shannon report parser**: post-process `.shannon/` outputs into a standardized findings JSON with OWASP / OWASP-API tagging
- **LlamaFirewall runtime probe**: optional `action=verify` that ships a tiny Python script the user runs inside their venv (still no execution from Security Gate's side)
- **Risk scoring**: combine KEV presence + reachability heuristics
- **Network hardening for `intel_refresh`**: explicit `fetch` timeouts, clearer partial-failure UX when CISA or OSV is slow/unreachable

## Future research: Dynamic Rule Synchronization

Goal: auto-generate or update `.mdc` rules from recurring findings so Layer 1 “learns” from Layer 3.

**Risk**: Cursor’s programmatic rule lifecycle is still evolving in the ecosystem (**Confidence: Med**). Keep this post-MVP until you have a stable internal format and review workflow.

## Non-goals

- Scraping random vulnerability blogs / unlicensed redistribution of vuln data
- “One click pwn production” UX
