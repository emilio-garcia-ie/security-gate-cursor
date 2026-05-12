# Security Gate — Roadmap (English)

## Shipped as of v0.1.1 (current)

- Plugin manifest + rules + skill + hooks (`sessionStart` hint)
- MCP tools: `handbrake_scan`, `project_profile`, `intel_refresh`, `layer2_brief`, **`lab_bootstrap`** (OS-keyed install plan + isolated `docker-compose.lab.yml` stack: Semgrep + Crucible CLI image)
- **`intel_refresh`**: writes `.security-gate/cache/kev.json` (full CISA KEV on success), `intel-meta.json` (includes `kev_error` when the KEV download fails), `osv-samples.json` (npm OSV query results for up to `maxPackages` names from **`package.json`**, default 8, max 50)
- **`layer2_brief`**: markdown from stack profile + cached **KEV** summary + **OSV** rows; **MVP** does not auto-join KEV to each OSV package row
- Docker Compose: **demo targets** (`docker-compose.yml`) + **scanner lab** (`docker-compose.lab.yml`)
- Cross-platform demo clone: `npm run clone-demo-targets` + Bash script alternative; **`npm run demo:up` / `npm run demo:down`** start/stop demo containers with **auto-selected free host ports** and printed URLs
- Documentation split: vibecoder vs technical; **`SETUP.md`** (install + **which Cursor workspace** drives `${workspaceFolder}` for MCP); **`docs/TROUBLESHOOTING.md`** (MCP missing, hooks, smoke failures, Docker lab); hackathon staged docs (`STAGE_01`, `STAGE_02`, `HACKATHON_FINAL_REPORT`, `API_KEY_ACQUISITION`)
- MCP smoke regression harness (`mcp-server/scripts/smoke*.mjs`, `npm run smoke:all`; optional `npm run smoke:intel` for sequential live **`intel_refresh` → `layer2_brief`** over MCP stdio, requires HTTPS)

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
- **Semgrep runner tool** (optional gated): run Semgrep with a curated ruleset and parse SARIF
- **Risk scoring**: combine KEV presence + reachability heuristics
- **Network hardening for `intel_refresh`**: explicit `fetch` timeouts, clearer partial-failure UX when CISA or OSV is slow/unreachable

## Future research: Dynamic Rule Synchronization

Goal: auto-generate or update `.mdc` rules from recurring findings so Layer 1 “learns” from Layer 3.

**Risk**: Cursor’s programmatic rule lifecycle is still evolving in the ecosystem (**Confidence: Med**). Keep this post-MVP until you have a stable internal format and review workflow.

## Non-goals

- Scraping random vulnerability blogs / unlicensed redistribution of vuln data
- “One click pwn production” UX
