# Setup Checklist — Security Gate

This file has two audiences:

- **You (the author)** — to run, test, and demo the plugin locally.
- **End users** — what anyone needs to do to use Security Gate inside Cursor.

> **TL;DR**: the plugin is **not self-installing**. The user must symlink (or copy) the plugin folder into Cursor's local plugins directory, reload Cursor, enable it in settings, and run `npm install` inside `mcp-server/`. After that, rules, hooks, and MCP tools work automatically.

**First win (after Part A, steps 1–3):** `cd mcp-server && npm install && npm run smoke:all` — if that passes, Node + MCP code are healthy before you touch Cursor UI. From the repo root you can also run **`npm run onboard`** (or `npm run onboard -- --dry-run`) for a guided install + symlink path; see **`docs/LLM_AND_KEYS_MATRIX.md`** for tool × credential mapping.

**Supported OS:** **macOS**, **Windows 10/11**, and **Linux** — Node for MCP/hooks, Git for demo clones, and Docker Desktop (macOS/Windows) or Docker Engine + Compose v2 (Linux). The MCP tool **`lab_bootstrap`** returns install hints keyed as `darwin`, `windows`, or `linux`.

---

## Which folder you open in Cursor (MCP — read this)

The plugin manifest (`.cursor-plugin/plugin.json`) registers MCP with:

`"args": ["${workspaceFolder}/mcp-server/index.mjs"]`

In Cursor, **`${workspaceFolder}` is the root of the folder you opened in that window**, not the path where the plugin files live under `~/.cursor/plugins/local/`.

| Goal | What to do |
|------|-------------|
| **Develop or demo this repo** | Open **this repository** as the workspace (the folder that contains `mcp-server/`). Then the path above resolves correctly and tools like `handbrake_scan` work out of the box. |
| **Use Security Gate while your workspace is a different app** | The bundled args line points at **`your-app/mcp-server/`**, which will not exist. Use **Part B, step 7**: merge `examples/mcp.snippet.json` into your Cursor MCP settings with an **absolute** path to **`…/plugins/local/security-gate/mcp-server/index.mjs`** (or wherever you installed the plugin). Optionally set **`SECURITY_GATE_WORKSPACE`** in that MCP entry to your app’s repo root so tools default there. |

Plain-language onboarding for day-to-day use: **`docs/VIBECODER_QUICKSTART.md`**. If something breaks, see **`docs/TROUBLESHOOTING.md`**.

---

## Part A — Author / Demo checklist

Run these steps in order on your own machine. All paths assume you start from the **repo root** (`security-gate-cursor/`).

### 1. Node.js

- **Requirement**: Node.js **18.18+**.
- Verify:

```bash
node --version
```

### 2. Install MCP server dependencies

```bash
cd mcp-server
npm install
```

### 3. Run the smoke regression suite (still inside `mcp-server/`)

```bash
npm run smoke:all
```

The harness must exit 0. This covers:
- MCP handshake + tool listing + `handbrake_scan`
- Production handbrake matrix (clean, `NODE_ENV=production`, `ENV=prod`, `PRODUCTION=true`, non-local DB, localhost DB)
- `looksLikeProdDbName` regressions (`myappprod`, `prod-db`, `mainDB`, `app_prod_v2` blocked; `staging-db`, `delivery-db` allowed)
- `session-hint.mjs` hook behavior (neutral `{}` on stdout, hint on stderr)
- **`smoke-onboard`**: `scripts/onboard.mjs --dry-run` succeeds (English locale)
- **`smoke-report`**: `scripts/export-final-report.mjs` writes a markdown file with Handbrake / Semgrep / Executive summary sections

Optional (requires **outbound HTTPS**, slower): `npm run smoke:intel` runs **`intel_refresh`** then **`layer2_brief`** in order over MCP stdio (uses the demo frontend workspace when `demo/cursor-webinar-sec/frontend` exists). To target another folder: `SECURITY_GATE_INTEL_WORKSPACE=/abs/path/to/project npm run smoke:intel` from `mcp-server/`.

Go back to the repo root when done:

```bash
cd ..
```

### 4. Install the plugin in Cursor

Create the local plugins directory if it doesn't exist yet.

**macOS / Linux:**

```bash
mkdir -p ~/.cursor/plugins/local
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.cursor\plugins\local" | Out-Null
```

**macOS / Linux** (symlink — from the repo root):

```bash
ln -s "$(pwd)" ~/.cursor/plugins/local/security-gate
```

**Windows** (copy — some setups don't follow symlinks):

From **inside** the repo folder in PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.cursor\plugins\local" | Out-Null
Copy-Item -Recurse -Force . "$env:USERPROFILE\.cursor\plugins\local\security-gate"
```

Or from the **parent** of the repo (adjust the folder name if needed):

```powershell
mkdir -Force "$env:USERPROFILE\.cursor\plugins\local"
xcopy /E /I /Q security-gate-cursor "$env:USERPROFILE\.cursor\plugins\local\security-gate"
```

### 5. Reload Cursor and enable the plugin

- **Developer: Reload Window** (or restart Cursor entirely).
- Open **Settings → Cursor Settings → Plugins** and enable **Security Gate**.

### 6. Verify the MCP server is reachable

Open **this repository** as the Cursor workspace (see **Which folder you open in Cursor** above). Then ask the agent to run:

```
handbrake_scan
```

You should see a JSON response with `dynamic_allowed`, `reasons`, `tier1_static_allowed`, etc.

If the tool does not appear, or your workspace is **not** this repo, see **Part B, step 7** (absolute MCP path + optional `SECURITY_GATE_WORKSPACE`).

### 7. Docker demo targets (optional but recommended for demos)

From the **repo root**:

```bash
npm run clone-demo-targets
npm run demo:up
```

`demo:up` picks **two free TCP ports** on your machine, starts **both** demo containers, and prints **`http://127.0.0.1:…`** URLs (no manual port configuration). Stop with `npm run demo:down`. For fixed ports instead, see root `docker-compose.yml` header comments.

```bash
docker compose up -d webapp-target
# or
docker compose up -d agent-target
```

> **Shell note**: `npm run clone-demo-targets` uses **Node** + **git** and works on **macOS, Windows, and Linux**. The Bash script `./scripts/clone-demo-targets.sh` is optional on macOS/Linux; on Windows without Git Bash you can still run the `npm` command from PowerShell or CMD if `git` is on `PATH`.

> **Manual clone** (any OS, if you prefer not to use the script):

> ```
> git clone https://github.com/mascarock/cursor-webinar-sec demo/cursor-webinar-sec
> git clone https://github.com/ReversecLabs/damn-vulnerable-llm-agent demo/damn-vulnerable-llm-agent
> ```

- Web app / agent URLs: printed by **`npm run demo:up`** (dynamic ports). With raw `docker compose` only: defaults `http://localhost:23000` and `http://localhost:18501` unless you set `SECURITY_GATE_WEBAPP_PORT` / `SECURITY_GATE_AGENT_PORT`.

Tear down when done:

```bash
docker compose down -v
```

### 8. External tools (each wired through an MCP tool — host installs are user's job)

Every external scanner now has an MCP entry point. The plugin never installs privileged software for you; each tool's `action=install_plan` returns the copy-paste commands.

| External tool | MCP entry point | Host prereqs | Credentials |
|---------------|-----------------|--------------|-------------|
| **Semgrep** (Tier 1) | **`semgrep_scan`** (bundled OSS wrapper) **and/or** `lab_bootstrap` `semgrep-lab` (Docker) | Host `semgrep` CE binary **or** Docker | None |
| **Crucible** (Tier 2 agentic) | `lab_bootstrap` `crucible-lab` (Docker) | Docker | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` |
| **Shannon** (Tier 2 web/API) | `shannon_pentest` (host wrapper around `npx @keygraph/shannon`) | Docker + Node 18+ | `ANTHROPIC_API_KEY` **or** `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` (OpenRouter / Vercel AI Gateway) |
| **DeepSec** (Tier 3 deep review) | `deepsec_review` (host wrapper around `npx deepsec` + pnpm) | Node 22+, pnpm | `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` / `ANTHROPIC_AUTH_TOKEN` (in `.deepsec/.env.local`) |
| **LlamaFirewall** (Tier 2.5 runtime defense) | `llamafirewall_advisor` (read-only advisor) | Python 3.10+, pip, internet for HF model download | None for core; optional `TOGETHER_API_KEY` / `FIREWORKS_API_KEY` |

For the free-vs-paid LLM picture across all four LLM-consuming tools (Shannon / DeepSec / Crucible / LlamaFirewall optional scanners), see [`docs/FREE_VS_PAID_LLM.md`](docs/FREE_VS_PAID_LLM.md).

**About the official `semgrep mcp` / standalone OSS server (May 2026 reality check):**

- The **`semgrep mcp` subcommand** built into the `semgrep` binary **requires the Pro Engine** (paid Semgrep AppSec Platform). On Community Edition you get: `MCP subcommand requires Pro Engine--make sure you are using the proprietary semgrep binary.`
- The **standalone OSS server** `ghcr.io/semgrep/mcp` / PyPI `semgrep-mcp` was **deprecated** in Semgrep v0.9.0 (Sept 2025) and now only exposes a `deprecation_notice` tool — it cannot scan code.
- That is why Security Gate **bundles its own `semgrep_scan` MCP tool** (`mcp-server/lib/semgrep-scan.mjs`) — a thin wrapper around the host **Semgrep Community Edition** binary with a Docker fallback (`semgrep/semgrep:latest`). It satisfies the workspace `semgrep_scan` rule out of the box, without requiring the Pro Engine or any separate MCP entry. Install Semgrep CE once on the host (`brew install semgrep` on macOS, or `pip install semgrep`) **or** rely on the Docker fallback — `semgrep_scan` action=`status` reports which engine it will use.

---

## Part B — What an end user must do

If someone clones or downloads this repo and wants to use Security Gate in their Cursor, they should follow **Part A, steps 1–2 and 4–6** (Node, `mcp-server` install, symlink/copy plugin, reload, enable, verify MCP). **Part A, step 3** (`npm run smoke:all`) is optional for end users but **recommended** so you catch environment issues early.

Here is a concise checklist you can share with users:

### Step-by-step for end users

1. **Install Node.js 18.18+** (if not already installed).

2. **Clone this repo** and `cd` into it (use **your** fork or path; folder name may differ from the example):

   ```bash
   git clone https://github.com/emilio-garcia-ie/security-gate-cursor.git
   cd security-gate-cursor
   ```

3. **Install MCP dependencies** (from the repo root):

   ```bash
   cd mcp-server && npm install && cd ..
   ```

   Optional: the root `package.json` only defines **`npm run clone-demo-targets`** for cross-platform demo setup (no extra install beyond Node).

4. **Create the local plugins directory** (if it doesn't already exist):

   **macOS / Linux:**

   ```bash
   mkdir -p ~/.cursor/plugins/local
   ```

   **Windows (PowerShell):**

   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.cursor\plugins\local" | Out-Null
   ```

5. **Install the plugin** (macOS / Linux):

   ```bash
   ln -s "$(pwd)" ~/.cursor/plugins/local/security-gate
   ```

   **Windows**: from inside the repo in PowerShell, `Copy-Item -Recurse -Force . "$env:USERPROFILE\.cursor\plugins\local\security-gate"` (after creating `%USERPROFILE%\.cursor\plugins\local`), or use `xcopy` from the parent folder as in Part A.

6. **Reload Cursor** and enable **Security Gate** in **Settings → Cursor Settings → Plugins**.

7. **If MCP tools don't appear — or you work in another repo's window** (common): `${workspaceFolder}` in the plugin manifest refers to **the opened project**, not the plugin install directory. Fix it by:

   - Open `examples/mcp.snippet.json`.
   - Replace `/ABSOLUTE/PATH/TO/security-gate-cursor` with the **real** path to your **plugin copy** (often `~/.cursor/plugins/local/security-gate` after symlink/copy).
   - Paste the `mcpServers` block into your Cursor MCP configuration (user-level or project-level, per your preference).
   - Optionally set `SECURITY_GATE_WORKSPACE` to your **application** repo root so `handbrake_scan` / `intel_refresh` target that tree without passing `workspaceRoot` every time.

8. **Open the workspace you intend to secure** (this repo for plugin hacking, or your app — if your app, you should have completed step 7). The plugin now contributes:
   - **Layer 1 rules** (`.mdc`) when they apply to edits in that workspace.
   - **Layer 2 rules** (`.mdc`) when planning risky features.
   - **`sessionStart` hook** (when Cursor loads the hook from the enabled plugin).
   - **MCP tools** (`handbrake_scan`, `project_profile`, `intel_refresh`, `layer2_brief`, `lab_bootstrap`, `deepsec_review`, `shannon_pentest`, `llamafirewall_advisor`) when the MCP server started from step 7 (or from opening this repo with the default manifest).

### What the plugin does automatically (no further action needed)

| Feature | How it works |
|---------|-------------|
| **Layer 1 rules** (`.mdc`) | Applied automatically to every file edit in any open workspace. |
| **Layer 2 rules** (`.mdc`) | Triggered when the agent is planning a feature flagged as risky. |
| **Session hint hook** | Fires once per new session with a short tip. |
| **`handbrake_scan`** | Scans merged env vars (process + `.env*` files) — no config needed. |
| **`project_profile`** | Reads `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Gemfile` in the workspace root. |
| **`intel_refresh`** | Downloads CISA KEV JSON and queries OSV for up to **`maxPackages`** npm names from **`package.json`** (default 8). Writes `kev.json`, `intel-meta.json`, `osv-samples.json` under `.security-gate/cache/`. |
| **`layer2_brief`** | Markdown brief: project profile + **KEV** summary (cached catalog) + **OSV** rows. MVP does **not** auto-join KEV to each OSV package. |
| **`lab_bootstrap`** | Probes Docker/Python, prints an **install plan** when missing, and can `docker compose` the **scanner lab** (`docker-compose.lab.yml`). |
| **`deepsec_review`** | Host wrapper for **Vercel Labs DeepSec** (Tier-3 deep review). Detects Node 22+, pnpm, `.deepsec/` scaffold, and credentials (`AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` / `ANTHROPIC_AUTH_TOKEN`). Actions: `status` / `install_plan` / `init` / `scan` (default `limit=50`) / `report`. Never auto-runs `scan`. |
| **`shannon_pentest`** | Host wrapper for **KeygraphHQ Shannon** (Tier-2 dynamic web/API pentest). Detects Docker, Node 18+, Anthropic-compatible credentials, and classifies the `target_url` as disposable-or-not. Actions: `status` / `install_plan` / `setup` / `pentest` (gated, supports `dryRun`) / `report`. Refuses production-looking hostnames and missing credentials. |
| **`llamafirewall_advisor`** | **Advisor** for **Meta LlamaFirewall** (Tier-2.5 runtime defense). Detects Python 3.10+, agentic signals, and `llamafirewall` declaration/import. Actions: `status` / `install_plan` / `snippet`. **Never installs or executes anything** — LlamaFirewall lives inside the user's agent process. |

### What the user still needs to handle themselves

| Concern | Who handles it |
|---------|---------------|
| Installing Node.js | User |
| Installing MCP dependencies (`npm install`) | User |
| Symlinking / copying the plugin | User |
| Enabling the plugin in Cursor settings | User |
| Configuring MCP if `${workspaceFolder}` doesn't expand | User |
| Docker demo targets | User (only for demos) |
| Optional Semgrep/Crucible via Docker lab (`lab_bootstrap`) | User must install Docker Desktop / Engine first; MCP starts containers |
| Shannon Tier-2 pentest (`shannon_pentest`) | User installs Docker + Node 18+ and provides Anthropic-compatible credentials; MCP runs `npx @keygraph/shannon setup` / `start` on demand |
| DeepSec Tier-3 review (`deepsec_review`) | User installs Node 22+, enables pnpm via corepack, places one credential in `.deepsec/.env.local`; MCP runs `npx deepsec init` / `pnpm deepsec scan` on demand |
| LlamaFirewall Tier-2.5 runtime (`llamafirewall_advisor`) | User installs Python 3.10+, pip, and (optionally) `pip install llamafirewall`; MCP only **advises** and returns the integration snippet |
| API keys for LLM providers or external tools | User (free + paid options documented in `docs/FREE_VS_PAID_LLM.md`) |

---

## Scanner lab (MCP `lab_bootstrap`)

The MCP tool **`lab_bootstrap`** is the closest thing to a **one-click install** for Tier-1 static scanning and the **Crucible CLI** without polluting the host OS:

1. **Always** run **`handbrake_scan`** first so the agent knows whether dynamic testing is even appropriate.
2. Call **`lab_bootstrap`** with `action=install_plan` if Docker is missing — the JSON lists curated URLs + example shell commands (you must still approve/run them locally; nothing runs as root from MCP).
3. Once Docker is healthy, call **`lab_bootstrap`** with `action=start` (or `action=status` plus `autoStartIfReady=true`) to `docker compose -f docker-compose.lab.yml up -d --build`. This pulls **`semgrep/semgrep`** and builds the small **`docker/lab/crucible`** image that installs `crucible-security` from PyPI.
4. Use `docker compose … exec …` from the **plugin repo root** to run scans inside the bind-mounted workspace (see `README.md` for copy-paste examples).
5. Call **`lab_bootstrap`** with `action=stop` to tear the lab stack down.

The MCP server also prints a **one-line stderr probe** on startup (`docker:ok|missing`, `python:ok|missing`, `lab:up|down`) so logs immediately show whether the lab is reachable.

---

## Quick reference

**From `mcp-server/`** (after `cd mcp-server`):

| Command | Purpose |
|---------|---------|
| `npm run smoke:all` | Run full regression suite (MCP + handbrake + hook) |
| `npm run smoke` | Basic MCP handshake + tool listing + `handbrake_scan` |
| `npm run smoke:prod` | Production handbrake matrix |
| `npm run smoke:aux` | `looksLikeProdDbName` regressions + hook schema |
| `npm run smoke:intel` | Sequential `intel_refresh` → `layer2_brief` over MCP (network; optional) |

**From repo root** (parent of `mcp-server/`):

| Command | Purpose |
|---------|---------|
| `npm run clone-demo-targets` | Clone vulnerable demos into `demo/` (macOS / Windows / Linux; requires `git` on `PATH`) |
| `./scripts/clone-demo-targets.sh` | Same as above, Bash only (macOS / Linux or Git Bash on Windows) |
| `docker compose up -d webapp-target` | Start vulnerable web app for demo |
| `docker compose up -d agent-target` | Start vulnerable agent for demo |
| `docker compose down -v` | Stop and clean demo containers |
| `docker compose -f docker-compose.lab.yml …` | After the lab is up, `exec` into `semgrep-lab` / `crucible-lab` (see `README.md`) |

**In Cursor chat (MCP):**

| Tool | Purpose |
|------|---------|
| `lab_bootstrap` | `action=install_plan` → hints only; `action=start` / `status`+`autoStartIfReady` → isolated Semgrep + Crucible lab |

**Docs (after install):**

| Doc | Purpose |
|-----|---------|
| [`docs/VIBECODER_QUICKSTART.md`](docs/VIBECODER_QUICKSTART.md) | Short “what to run first” in plain language (`handbrake_scan`, `intel_refresh`, Docker, keys). |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | MCP missing, wrong workspace, hooks, smoke failures, Docker lab. |
| [`README.md`](README.md) | Overview, decision flow, MCP tool table. |
| [`docs/API_KEY_ACQUISITION.md`](docs/API_KEY_ACQUISITION.md) | Which tools need keys vs public feeds. |
