# Security Gate (Cursor Plugin)

Security Gate is a **hackathon-ready** Cursor plugin template that implements a **three-layer security workflow**:

1. **Layer 1 — Rules**: Cursor rules (`.mdc`) steer secure defaults *before* code is written.
2. **Layer 2 — Planning**: an evidence-first planning rule asks for top risks *with grounding* from a local intel snapshot (when available).
3. **Layer 3 — Orchestration**: an MCP server provides **`handbrake_scan`**, **`project_profile`**, **`intel_refresh`**, **`layer2_brief`**, and **`lab_bootstrap`**, and is designed to **block dynamic testing** when production-like environment signals are detected.

> **Important**: Shannon and DeepSec are **not vendored** inside this repository. For a closer “one-click” experience, **`lab_bootstrap`** can start an **isolated Docker Compose lab** that runs the official **Semgrep** image plus a small **Crucible (`crucible-security` on PyPI)** image built from this repo’s `docker/lab/crucible/Dockerfile`. Host installs of Docker/Python are still the user’s responsibility; the MCP tool returns copy-paste install plans when anything is missing.

## Supported platforms

Security Gate is intended to work on **macOS**, **Windows 10/11**, and **Linux** (x86_64 or ARM, matching Docker Desktop / Engine support for your distro).

- **MCP server & smoke tests**: pure **Node.js** (`>=18.18`); paths use `path.join` / `path.resolve`.
- **Hooks**: `hooks/hooks.json` invokes `node ./hooks/session-hint.mjs` — ensure **Node** is on `PATH` in Cursor’s environment on every OS.
- **Docker**: use **Docker Desktop** on macOS and Windows; **Docker Engine + Compose plugin** on Linux. Bind mounts for the scanner lab require Docker to share the drive that holds your workspace (default on macOS; enable WSL2/file sharing on Windows per Docker docs).
- **Demo clones**: use **`npm run clone-demo-targets`** at the repo root (cross-platform) or `./scripts/clone-demo-targets.sh` on macOS/Linux with Bash.

## Decision flow (centerpiece)

```
                    +-------------------+
                    | Open workspace    |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    | project_profile   |
                    | (stack signals)   |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    | handbrake_scan    |
                    | (prod signals)    |
                    +---------+---------+
                              |
               +--------------+--------------+
               |                             |
               v                             v
   dynamic_allowed = false          dynamic_allowed = true
   (block Tier 2/3 dynamic)        (disposable env only)
               |                             |
               v                             v
        Tier 1 static only              Tier 1 static
        (e.g., Semgrep)               + optional dynamic
                                      (Shannon / Crucible)
```

**Mandatory ordering**: always run **`handbrake_scan`** before attempting any live exploit testing or autonomous red teaming.

## Quick start (developers)

1. Install Node.js **18.18+**. For detailed guidance, MCP workspace pitfalls, and smoke tests see **[`SETUP.md`](SETUP.md)**; for problems see **[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)**.
2. Install MCP dependencies:

```bash
cd mcp-server && npm install && cd ..
```

3. Install the plugin locally for Cursor (**Confidence: Med** — plugin packaging evolves; verify in your Cursor version):

**macOS / Linux** — create the plugins folder, then symlink from the **repo root**:

```bash
mkdir -p ~/.cursor/plugins/local
ln -s "$(pwd)" ~/.cursor/plugins/local/security-gate
```

**Windows** — if symlinks are unreliable, **copy** or **mirror** the repo into the local plugins folder. From **inside** the cloned repo folder in PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.cursor\plugins\local" | Out-Null
Copy-Item -Recurse -Force . "$env:USERPROFILE\.cursor\plugins\local\security-gate"
```

Or, from the **parent** folder of the repo (replace the folder name if yours differs):

```powershell
mkdir -Force "$env:USERPROFILE\.cursor\plugins\local"
xcopy /E /I /Q security-gate-cursor "$env:USERPROFILE\.cursor\plugins\local\security-gate"
```

Local plugins directory (all OS): `~/.cursor/plugins/local/` on macOS/Linux, `%USERPROFILE%\.cursor\plugins\local\` on Windows.

4. Restart Cursor (or **Developer: Reload Window**), then open **Settings → Cursor Settings → Plugins** and enable **Security Gate**.

5. Ensure the MCP server is available:

- This repo’s `.cursor-plugin/plugin.json` includes an `mcpServers.security-gate` entry using `"${workspaceFolder}/mcp-server/index.mjs"`.
- If your Cursor build does not expand `${workspaceFolder}` for plugins, merge `examples/mcp.snippet.json` into your project’s MCP config and use **absolute paths**. See **`docs/TROUBLESHOOTING.md`** if tools are missing when you open another repo.

## Demo targets (Docker “digital cage”)

This repo includes a `docker-compose.yml` that builds **only the vulnerable demo apps**, not Shannon/Crucible themselves.

Clone demos (pick one — **recommended on Windows**):

```bash
npm run clone-demo-targets
```

Or on macOS/Linux with Bash:

```bash
./scripts/clone-demo-targets.sh
```

**Easiest way to start demos (recommended):** picks **free host ports** automatically and prints URLs — no YAML, no manual port hunting:

```bash
npm run demo:up
```

Stop containers (keeps images):

```bash
npm run demo:down
```

Advanced (fixed defaults **23000** / **18501**, or your own ports):

```bash
docker compose up -d webapp-target
# or
docker compose up -d agent-target
```

**`webapp-target` note:** this Compose file builds a **standalone** static frontend. Default URL when using raw compose: **`http://localhost:23000`** (override with `SECURITY_GATE_WEBAPP_PORT`). The `/api/` routes return **503** here because the real **`backend`** service is only present when you run the **full** stack under `demo/cursor-webinar-sec/docker-compose.yaml`. The SPA UI should still load for demos that do not require a live API.

**`agent-target` port:** default with raw compose: **`http://localhost:18501`**. Override: `SECURITY_GATE_AGENT_PORT`.

**Shell tip:** YAML from `docker-compose.yml` (lines starting with `ports:`) is **not** a terminal command — only run shell commands like `docker compose …` or **`npm run demo:up`**. Changing ports when not using `demo:up` is done with **environment variables** (see header comments in `docker-compose.yml`).

Delete containers **and** demo volumes when you are done:

```bash
docker compose down -v
```

## MCP tools (what the server does today)

| Tool | Purpose |
|------|---------|
| `handbrake_scan` | Detect production-like environment signals from **process env + workspace `.env*` files**. Blocks dynamic testing recommendations when triggered. |
| `project_profile` | Coarse stack detection (npm `package.json`, Python manifests, etc.). |
| `intel_refresh` | Downloads **CISA KEV** JSON and runs **OSV** queries for up to **`maxPackages`** npm names from the workspace **`package.json`** merged `dependencies` / `devDependencies` (default **8**, max **50**; **not** lockfile / PyPI / other ecosystems in MVP). Writes `.security-gate/cache/` (`kev.json`, `intel-meta.json`, `osv-samples.json`). |
| `layer2_brief` | Markdown brief for Layer 2: **stack profile** + **shallow CISA KEV** summary (from `kev.json` / `intel-meta.json`, including `kev_error` when refresh failed) + **OSV rows** (from `osv-samples.json`). **MVP:** KEV is **not** auto-joined row-by-row with OSV results. |
| `lab_bootstrap` | Detects **Docker** / **Python**, returns an OS-specific **install plan** when missing, and can **`docker compose`** an isolated **Semgrep + Crucible** lab (`docker-compose.lab.yml`) that bind-mounts your workspace. See `SETUP.md` (Scanner lab). |

**Intel scope (explicit):** `intel_refresh` / `layer2_brief` use **public** CISA KEV + OSV data over the network; **no API keys** are required for that MVP path. **NVD** ingestion and **`NVD_API_KEY`** are **optional roadmap** extensions — the shipped `mcp-server` does **not** call the NVD API yet. See **`docs/ROADMAP.md`**, **`docs/API_KEY_ACQUISITION.md`**, and **`docs/TECHNICAL_DEEP_DIVE.md`** (NVD section).

### Scanner lab (optional)

After `handbrake_scan` looks safe for your *workflow*, run **`lab_bootstrap`** with `action=start` (or `action=status` + `autoStartIfReady=true`) to pull/build and start **`semgrep-lab`** and **`crucible-lab`**. Example execs:

```bash
docker compose -f docker-compose.lab.yml exec semgrep-lab semgrep --config auto --error /workspace
docker compose -f docker-compose.lab.yml exec crucible-lab crucible --help
```

Run these from the **plugin repo root** (where `docker-compose.lab.yml` lives). The MCP server logs a one-line lab probe to **stderr** on startup. These commands work in **macOS**, **Windows**, and **Linux** terminals as long as the Docker CLI is on `PATH`.

## Production safety handbrake (behavior)

When **`handbrake_scan`** detects production-like signals, it returns:

> **Production environment detected. Live exploit testing has been disabled to protect your data. Only static analysis (Tier 1) is available.**

Signals include (non-exhaustive): `NODE_ENV=production`, `ENV`/`RAILS_ENV` production-like values, `PRODUCTION=true`, **non-local database hosts** (heuristic; see `mcp-server/index.mjs`), and **production-like database names** in URLs.

**Shannon documentation** emphasizes disposable environments — treat that as a hard requirement for any dynamic demo.

## Documentation map

- **Hackathon final report (Stage 3 bundle):** [`docs/HACKATHON_FINAL_REPORT.md`](docs/HACKATHON_FINAL_REPORT.md)
- **Stage 1 (strategy + architecture):** [`docs/STAGE_01_STRATEGY_AND_ARCHITECTURE.md`](docs/STAGE_01_STRATEGY_AND_ARCHITECTURE.md)
- **Stage 2 (technical design + costs):** [`docs/STAGE_02_TECHNICAL_DESIGN_AND_COSTS.md`](docs/STAGE_02_TECHNICAL_DESIGN_AND_COSTS.md)
- Vibecoders: [`docs/VIBECODER_QUICKSTART.md`](docs/VIBECODER_QUICKSTART.md)
- Engineers: [`docs/TECHNICAL_DEEP_DIVE.md`](docs/TECHNICAL_DEEP_DIVE.md)
- API keys: [`docs/API_KEY_ACQUISITION.md`](docs/API_KEY_ACQUISITION.md)
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Hackathon demo script: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)

## Tool credits (short)

| Tool | Why it exists in the overall design |
|------|-------------------------------------|
| [Semgrep](https://semgrep.dev/docs) | Fast, local static analysis (Tier 1). |
| [DeepSec](https://github.com/vercel-labs/deepsec) | Deep AI-assisted code review; cost-calibrate with vendor guidance. |
| Shannon (Keygraph) | Dynamic web/API testing; must run in disposable environments. |
| [Crucible](https://github.com/crucible-security/crucible) | OWASP Agentic Top 10 style testing for LLM/agent systems. |
| LlamaFirewall (Meta) | Local guardrails for agent input/output safety. |
| [NVD](https://nvd.nist.gov/) / [OSV](https://osv.dev/) / [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Free, ethical vulnerability intelligence sources. |

**Friskit**: treat as a **reference concept** for “bundle security UX for non-experts” — not a dependency of this repo.

## License

MIT — see [`LICENSE`](LICENSE).


## Competitive comparison (high level)

| Capability | Cursor native security agents (typical) | Security Gate (this repo) |
|---|---|---|
| Static guidance in-editor | Strong | Strong (explicit `.mdc` rules + skill) |
| Dependency/CVE intelligence (local cache) | Partial / varies | Strong intent (`intel_refresh` + `layer2_brief`) |
| Live exploit / autonomous dynamic testing | Not a replacement for dedicated tooling | **Out of scope by default**; orchestration hooks + **handbrake** enforce disposable targets |
| Agentic red teaming (Crucible-class) | Not the core product | Supported as **external** tooling behind guardrails |
| “Do not attack prod” guardrail | Partial (policy + user judgment) | Explicit **`handbrake_scan`** signal model |

This table is **not** a benchmark; it is a product positioning guide (**Confidence: Med** — native agent capabilities change over time).
