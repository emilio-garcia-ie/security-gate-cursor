# Security Gate — Configuration map (where everything lives)

Use this as the **single checklist** so you know **what to configure**, **where**, and **in what order**.  
Replace `REPO` with your clone path if it differs (example: `/Users/emilio/Desktop/security-gate-cursor`).

---

## 1) Real directory structure (your machine + this repo)

### A. Plugin install (Cursor reads this once enabled)

```text
~/.cursor/plugins/local/security-gate   →  symlink  →  REPO/
                              │
                              └── must contain at repo root:
                                    .cursor-plugin/plugin.json
                                    rules/
                                    skills/
                                    hooks/
                                    mcp-server/index.mjs   (via workspace or absolute MCP args)
```

**Create / fix the symlink (run from anywhere):**

```bash
REPO="/Users/emilio/Desktop/security-gate-cursor"
mkdir -p "$HOME/.cursor/plugins/local"
ln -sfn "$REPO" "$HOME/.cursor/plugins/local/security-gate"
ls -la "$HOME/.cursor/plugins/local/security-gate"
```

### B. User MCP config (Cursor merges this with the plugin)

```text
~/.cursor/mcp.json
```

Typical `security-gate` entry (absolute path to **this** repo’s MCP server):

```json
"security-gate": {
  "command": "node",
  "args": ["/Users/emilio/Desktop/security-gate-cursor/mcp-server/index.mjs"]
}
```

**Optional — MCP should analyze a *different* folder than the one you opened:**

```json
"env": {
  "SECURITY_GATE_WORKSPACE": "/ABSOLUTE/PATH/TO/YOUR/APP"
}
```

(Same idea as `examples/mcp.snippet.json`.)

**Note on the workspace `semgrep_scan` rule (no extra MCP entry needed):**

The Security Gate MCP server now ships its own `semgrep_scan` tool — a thin OSS wrapper around the host `semgrep` Community Edition binary (or `semgrep/semgrep:latest` Docker as fallback). That **satisfies the workspace `semgrep_scan` rule** without any extra MCP entry.

You should **NOT** wire `"command": "semgrep", "args": ["mcp"]` — that subcommand requires the **Pro Engine** (paid Semgrep AppSec Platform) and Community Edition returns `MCP subcommand requires Pro Engine--make sure you are using the proprietary semgrep binary.`

The standalone `ghcr.io/semgrep/mcp` / PyPI `semgrep-mcp` was **deprecated** in Semgrep v0.9.0 (Sept 2025) and now exposes only a `deprecation_notice` tool — also not useful.

If you really want Pro features through MCP (cross-file taint, supply chain, secrets), buy Semgrep Pro and add `"command": "semgrep", "args": ["mcp"]` separately. For OSS use the bundled `semgrep_scan` directly:

```jsonc
// example call from the agent
{ "name": "semgrep_scan", "arguments": { "action": "status" } }
{ "name": "semgrep_scan", "arguments": { "action": "scan_text", "snippet": "import os\nos.system('echo ' + user_input)", "language": "python" } }
{ "name": "semgrep_scan", "arguments": { "action": "scan_path", "target_path": ".", "config": "p/owasp-top-ten" } }
```

To install Semgrep CE if `semgrep_scan` reports `engine=none`:

```bash
# macOS
brew install semgrep
# any Python
pip install semgrep
# or rely on Docker fallback (no install needed if Docker is running)
```

### C. User hooks (global; must be valid JSON)

```text
~/.cursor/hooks.json
```

Must use the nested shape:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [ ... ]
  }
}
```

Plugin hooks from Security Gate are declared in **`REPO/hooks/hooks.json`** (loaded with the plugin).

### D. This repository (what you open in Cursor for “full” behaviour)

```text
REPO/
├── .cursor-plugin/plugin.json     ← plugin manifest (MCP, rules paths)
├── rules/                         ← Cursor rules (.mdc): security, supply-chain, planning, onboarding
├── skills/                        ← bundled skills
├── hooks/hooks.json               ← sessionStart → session-hint.mjs
├── mcp-server/                    ← Node MCP (npm install here)
│   ├── package.json
│   └── index.mjs
├── docker-compose.yml             ← demo targets (webapp + agent)
├── docker/webapp-target/          ← standalone web Dockerfile + nginx
├── scripts/
│   ├── onboard.mjs
│   ├── clone-demo-targets.mjs
│   ├── clone-demo-targets.sh
│   ├── demo-up.mjs                ← picks free ports + prints URLs
│   ├── demo-down.mjs
│   ├── export-final-report.mjs
│   └── benchmark-demo.mjs
├── demo/                          ← cloned demos (gitignored in this template)
│   ├── cursor-webinar-sec/
│   └── damn-vulnerable-llm-agent/   (+ Dockerfile patch for Debian)
└── .security-gate/cache/          ← intel_refresh output (under chosen workspace)
```

---

## 2) Cursor UI (English labels — match your Cursor language)

Do these **after** the symlink exists:

| Step | Where | Action |
|------|--------|--------|
| 1 | Command Palette **⌘⇧P** | Run **`Developer: Reload Window`** |
| 2 | **File → Open Folder** | Open **`REPO`** (folder that contains `mcp-server/`) |
| 3 | **⌘⇧J** → Cursor Settings → **Plugins** | Enable **Security Gate** (if listed) |
| 4 | **⌘⇧J** → **Features → Model Context Protocol** | Toggle **security-gate** **ON** |
| 5 | **⌘⇧J** → **Hooks** | No red “invalid hooks.json” on **`~/.cursor/hooks.json`** |
| 6 | Chat (Agent) | Ask to run **`handbrake_scan`**, then **`project_profile`** |

---

## 3) Terminal — one ordered path to “everything works”

Run from **`REPO`** unless noted.

```bash
# 0. Define REPO once per shell session
REPO="/Users/emilio/Desktop/security-gate-cursor"
```

### 3.1 MCP dependencies + smoke (proves Node + MCP code)

```bash
cd "$REPO/mcp-server"
npm install
npm run smoke:all
```

Optional (network, intel path):

```bash
cd "$REPO/mcp-server"
SECURITY_GATE_INTEL_WORKSPACE="$REPO" npm run smoke:intel
```

### 3.2 Plugin symlink (if not already)

```bash
mkdir -p "$HOME/.cursor/plugins/local"
ln -sfn "$REPO" "$HOME/.cursor/plugins/local/security-gate"
```

### 3.3 Docker demos (one target at a time — by design)

The demos are split to **showcase one Security Gate flow at a time**: webapp = SQLi-style remediation; agent = prompt-injection / agentic Top 10.

```bash
cd "$REPO"
npm run clone-demo-targets        # one-time clone of the two demo repos

# Run ONE demo at a time
npm run demo:webapp               # → prints free-port URL for the web app
# or
npm run demo:agent                # → prints free-port URL for the agent UI
```

Stop selectively:

```bash
npm run demo:down -- webapp
npm run demo:down -- agent
npm run demo:down                 # stop all demo services at once
```

**Do not** paste YAML `ports:` lines into the shell; use the npm scripts above or env vars documented in `docker-compose.yml` (`SECURITY_GATE_WEBAPP_PORT`, `SECURITY_GATE_AGENT_PORT`).

### 3.4 Scanner lab — Docker vs. API key (honest matrix)

`lab_bootstrap` starts an isolated **`docker-compose.lab.yml`** stack. The two services have different requirements:

| Service | Needs Docker | Needs API key | Why |
|---------|--------------|---------------|-----|
| `semgrep-lab` (image `semgrep/semgrep:latest`) | yes | **no** | Pure static analysis, 100% local. |
| `crucible-lab` (custom `python:3.12-slim` + `pip install crucible-security`) | yes | **yes** — one of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` | Crucible needs an attacker-side LLM to run agentic attacks. Without a key, the container starts but real attacks won’t execute. |

That is why the lab is labelled “optional”: **`semgrep-lab` works alone** for Tier-1 dynamic flows; **`crucible-lab`** adds agentic testing only when you provide credentials.

### 3.5 `semgrep_scan` — bundled OSS Semgrep wrapper

The Security Gate MCP server ships a `semgrep_scan` tool (`mcp-server/lib/semgrep-scan.mjs`). It satisfies the workspace `semgrep_scan` rule **without requiring Semgrep Pro Engine or any extra MCP entry**.

| Capability | Detail |
|------------|--------|
| Engine resolution | 1) host `semgrep` Community Edition; 2) Docker fallback (`semgrep/semgrep:latest`). |
| Default ruleset | `p/ci` (broad OSS pack, no metrics opt-in required). Override with `config="p/owasp-top-ten"`, `p/javascript`, `p/python`, etc. |
| Actions | `status` (engine detection), `scan_path` (file/dir), `scan_text` (inline snippet, max 200 KB). |
| Safety | Rejects paths with >5000 files; ignores `node_modules`, `.git`, `.venv`, `dist`. |
| Exit-code handling | Treats exit codes 0 and 1 as success (Semgrep returns 1 when findings exist). Anything else surfaces as `blocked_reason` with `stderr_tail`. |

If both host CLI and Docker are absent, `semgrep_scan action=status` returns the install hint instead of crashing — the wrapper never assumes a binary exists.

### 3.6 Shannon (Tier 2 web/API pentest) — host integration, not Docker lab

Shannon (KeygraphHQ) is wrapped by the **`shannon_pentest`** MCP tool. Like DeepSec, it is host-based (`npx @keygraph/shannon`) and orchestrates its own Docker containers internally.

| Requirement | Where | Notes |
|-------------|--------|-------|
| **Docker** | host | Shannon spawns its own internal containers — distinct from `docker-compose.lab.yml`. |
| **Node 18+** | host | `nvm install 20 && nvm use 20` or vendor installer. |
| **Anthropic-compatible credential** | process env | Native: `ANTHROPIC_API_KEY`. Proxy (OpenRouter / Vercel AI Gateway): `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`. |
| **Disposable target** | argument | `target_url` must point to a containerized test environment. Production-looking hostnames (`*prod*`, `*production*`, `*.live`, `*.internal`, etc.) are rejected by the wrapper. |

Call order from the agent: `shannon_pentest action=status` → `action=install_plan` → `action=setup` (once) → `action=pentest target_url=http://localhost:23000 [dryRun=true]` → `action=report`.

### 3.7 LlamaFirewall (Tier 2.5 runtime defense) — advisor only

The **`llamafirewall_advisor`** MCP tool is read-only. It detects whether your workspace looks agentic, whether `llamafirewall` is already in `requirements.txt` / `pyproject.toml`, and returns:

- An **install plan** (Python 3.10+ + venv + `pip install llamafirewall>=1.0.3`).
- A **Python snippet** to paste at your agent entry point (`PromptGuardScanner` + `CodeShieldScanner`).

LlamaFirewall's core scanners run on **local Hugging Face models** — no key, no token cost. Optional paid scanners use `TOGETHER_API_KEY` / `FIREWORKS_API_KEY`.

### 3.8 DeepSec (Tier 3 deep review) — host integration, not Docker lab

DeepSec ships as a Node-only CLI that scaffolds into a `.deepsec/` folder inside your workspace; it is **not** a long-running Docker service. The MCP tool **`deepsec_review`** wraps it conservatively:

| Requirement | Where | Notes |
|-------------|--------|-------|
| **Node.js 22+** | host | `node --version` ≥ 22.0. The rest of Security Gate needs only 18.18+, so DeepSec sometimes forces a Node upgrade. |
| **pnpm** | host | Installed automatically by `corepack enable && corepack prepare pnpm@latest --activate` (the install plan returns the exact commands). |
| **Workspace scaffold** | `<workspace>/.deepsec/` | Created by `deepsec_review action=init`. Already in `.gitignore`. |
| **Credentials** | `<workspace>/.deepsec/.env.local` or process env | One of `AI_GATEWAY_API_KEY` (Vercel AI Gateway, recommended), `VERCEL_OIDC_TOKEN`, or `ANTHROPIC_AUTH_TOKEN`. |
| **Calibration** | `deepsec_review action=scan` | Defaults to `--limit 50` to keep cost bounded; raise only after a successful small run. |

Call order from the agent: `deepsec_review action=status` → if missing, `action=install_plan` → `action=init` once → `action=scan` → `action=report`. The tool never auto-runs `scan` without explicit consent.

---

## 4) “Everything included” checklist (tick mentally)

- [ ] `REPO` opens in Cursor; MCP **security-gate** ON  
- [ ] `~/.cursor/plugins/local/security-gate` → `REPO`  
- [ ] `cd mcp-server && npm run smoke:all` → all OK  
- [ ] `~/.cursor/hooks.json` valid (nested `"hooks"`) if you use global hooks  
- [ ] `handbrake_scan` returns JSON in chat  
- [ ] (Optional) `npm run demo:up` prints URLs and both UIs load  
- [ ] (Optional) `intel_refresh` + `layer2_brief` when you want Layer 2 cache  
- [ ] (Other app only) `SECURITY_GATE_WORKSPACE` in `~/.cursor/mcp.json` for `security-gate`  

---

## 5) Git hygiene (optional but recommended before push)

`REPO/.gitignore` already includes `.security-gate/cache/` and `demo/`.  
Commit everything you want to keep:

```bash
cd "$REPO"
git status
git add -A
git commit -m "Your message"
```

---

## 6) Quick reference — env vars you might set

| Variable | Where | Purpose |
|----------|--------|---------|
| `SECURITY_GATE_WORKSPACE` | `~/.cursor/mcp.json` → `security-gate.env` | Default workspace root for tools when Cursor’s open folder is not `REPO` |
| `SECURITY_GATE_INTEL_WORKSPACE` | shell only | `npm run smoke:intel` picks which folder OSV/KEV refresh uses |
| `SECURITY_GATE_LOCALE` | shell / `.env` | Onboarding language: `en` (default) or `es` — same effect as `--locale=es` in `npm run onboard` |
| `SECURITY_GATE_WEBAPP_PORT` / `SECURITY_GATE_AGENT_PORT` | shell only | Fixed host ports when **not** using `npm run demo:up` |

---

For day-to-day behaviour of each MCP tool, see **`README.md`**. For install edge cases, see **`SETUP.md`** and **`docs/TROUBLESHOOTING.md`**. For **tool × provider × env** in one table, see **`docs/LLM_AND_KEYS_MATRIX.md`**. For the **OWASP & ISO 27001 mapping** that the rules reference, see **`docs/STANDARDS_MAPPING.md`**. For **free vs paid LLM trade-offs** (Ollama, Gemini, OpenRouter free, Groq free, Anthropic paid), see **`docs/FREE_VS_PAID_LLM.md`**.
