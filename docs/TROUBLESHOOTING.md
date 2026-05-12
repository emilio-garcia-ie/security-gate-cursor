# Security Gate — Troubleshooting (MCP, hooks, smoke)

Use this when something “should work” after [`SETUP.md`](../SETUP.md). Keep [`VIBECODER_QUICKSTART.md`](VIBECODER_QUICKSTART.md) open for the happy path. **Conceptual “why” questions** (not broken installs): [`FAQ.md`](FAQ.md).

---

## MCP tools do not appear in chat

**Likely cause:** the bundled plugin manifest points the MCP server at:

`${workspaceFolder}/mcp-server/index.mjs`

`workspaceFolder` is **the folder you opened in Cursor**, not the plugin install directory. If that folder is not the Security Gate repo (no `mcp-server/index.mjs` inside it), the MCP process never starts.

**Fix (pick one):**

1. **Develop / demo Security Gate:** open **this repository** as the workspace root (the directory that contains `mcp-server/`).
2. **Work on another app:** add an MCP server entry manually using **absolute** paths — copy from [`examples/mcp.snippet.json`](../examples/mcp.snippet.json), set `args` to your real `…/mcp-server/index.mjs` (often under `~/.cursor/plugins/local/security-gate/` after install). See **SETUP.md → Part B, step 7**.

**Also check:** plugin **Security Gate** is enabled under **Settings → Cursor Settings → Plugins**, then **Developer: Reload Window**.

---

## `handbrake_scan` / `intel_refresh` target the wrong folder

Tools accept optional `workspaceRoot`. If omitted, resolution order is:

1. Tool argument `workspaceRoot`
2. Environment variable **`SECURITY_GATE_WORKSPACE`**
3. `process.cwd()` (what the MCP server sees as cwd — often the opened workspace)

**Fix:** pass `workspaceRoot` explicitly in the tool call, or set `SECURITY_GATE_WORKSPACE` in the MCP server `env` block (see `examples/mcp.snippet.json`).

---

## `intel_refresh` or `smoke:intel` hangs or fails

- **Network:** CISA KEV and OSV require **outbound HTTPS**. Corporate proxies or offline sandboxes will block or delay calls.
- **No npm deps:** OSV rows may be empty if the chosen workspace has no `dependencies` / `devDependencies` in `package.json` — that is expected for MVP (see [`ROADMAP.md`](ROADMAP.md)).
- **KEV errors:** if the CISA feed fails, check `.security-gate/cache/intel-meta.json` for `kev_error`; an older `kev.json` may still be present.

---

## `npm run smoke:all` fails

Run from **`mcp-server/`** after `npm install`:

```bash
cd mcp-server && npm install && npm run smoke:all
```

- **`smoke` / handshake fails:** Node version &lt; 18.18, or MCP SDK install broken — reinstall deps.
- **`smoke-prod` fails:** unexpected env vars (`NODE_ENV`, `DATABASE_URL`, etc.) leaking into the test shell — compare with a clean terminal.
- **`smoke-aux` hook case fails:** `node` not on `PATH` for the hook subprocess, or `hooks/session-hint.mjs` missing — run from repo root context as in SETUP.

---

## Session hook: no hint on new session

1. Confirm **Security Gate** plugin is enabled (hooks ship with the plugin).
2. Cursor **hook schema can vary by version** — if hooks fail to load, you can temporarily remove the `hooks` key from `.cursor-plugin/plugin.json` and rely on MCP-only workflow (see [`TECHNICAL_DEEP_DIVE.md`](TECHNICAL_DEEP_DIVE.md) hooks section).
3. The script writes the tip to **stderr** and `{}` on stdout; some UIs only show stderr in hook logs.

---

## Semgrep MCP says “MCP subcommand requires Pro Engine” (or only exposes a `deprecation_notice` tool)

Three possible sources, all of them dead for OSS users (May 2026):

1. **Cursor / VS Code extension `semgrep.semgrep`** — registers an internal MCP server (`user-semgrep`) that runs `semgrep mcp` on startup. Cursor's MCP log shows `[V2 FSM] connection:connect_failure` with `MCP subcommand requires Pro Engine`. **Fix:** open Cursor → **Extensions** → search **Semgrep** → **Disable** (or **Uninstall**). You lose nothing on OSS — the bundled `semgrep_scan` MCP tool already covers static analysis, and you can still run `semgrep scan` from a terminal.
2. A **user-level `~/.cursor/mcp.json`** entry like `"command": "semgrep", "args": ["mcp"]`. **Fix:** remove that entry; rely on the bundled `semgrep_scan`.
3. Pulling the standalone Docker image `ghcr.io/semgrep/mcp` (or `uvx semgrep-mcp`). **Fix:** drop it — that server now only exposes a `deprecation_notice` tool.

Detail on each path:

| Path | Status | Why |
|------|--------|-----|
| `semgrep mcp` subcommand (Community Edition binary) | **Blocked** | Requires the Pro Engine — paid Semgrep AppSec Platform. CE returns `MCP subcommand requires Pro Engine--make sure you are using the proprietary semgrep binary.` |
| `ghcr.io/semgrep/mcp` Docker image / PyPI `semgrep-mcp` | **Deprecated v0.9.0** | Container starts and finishes the MCP handshake, but `tools/list` only returns `deprecation_notice` — it cannot scan. |
| `uvx semgrep-mcp` | **Deprecated v0.9.0** | Same as above. |

**Recommended fix (all three paths):** disable / uninstall the Semgrep extension AND remove the `semgrep` entry from `~/.cursor/mcp.json`. Rely on Security Gate's bundled **`semgrep_scan`** MCP tool, which wraps the OSS host CLI (Community Edition) with a Docker fallback. It already covers the workspace rule. Confirm with:

```bash
cd /path/to/security-gate-cursor/mcp-server
npm run smoke:semgrep    # should print engine + findings line + tools/list line
```

If `engine=none`, install Semgrep CE on the host (`brew install semgrep` / `pip install semgrep`) or start Docker (the wrapper will fall back to `semgrep/semgrep:latest`).

---

## `lab_bootstrap` says Docker missing / compose fails

- Install **Docker Desktop** (macOS/Windows) or **Docker Engine + Compose v2** (Linux).
- **`lab_bootstrap`** runs compose from the **plugin repo root** (where `docker-compose.lab.yml` lives), not from your app — that path is wired in code (`PLUGIN_ROOT`).
- **Windows:** ensure the drive containing `LAB_WORKSPACE` is shared with Docker (Docker Desktop → Settings → Resources → File sharing).
- Use `action=install_plan` first for copy-paste install hints when Docker is not installed.
- **Docker vs API key:** `semgrep-lab` needs **no key** (static scans). `crucible-lab` requires one of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` to perform real agentic attacks — without a key the container starts but Crucible refuses to attack.

---

## `deepsec_review` refuses to run a scan

`deepsec_review` is host-based; it intentionally fails closed when prerequisites are missing. The `status` action lists exactly what is wrong.

| Block reason | Fix |
|--------------|-----|
| `Node X detected; DeepSec requires Node 22+` | Install Node 22+ via the `install_plan` (nvm / brew / nodesource). The rest of Security Gate works on 18.18+, but DeepSec is stricter. |
| `pnpm is not on PATH` | `corepack enable && corepack prepare pnpm@latest --activate` (see `install_plan`). |
| `Scaffold missing` | Run `deepsec_review action=init` once per workspace. It executes `npx --yes deepsec@latest init` and `pnpm install` inside `.deepsec/`. |
| `No DeepSec credential` | Put **one** of `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` / `ANTHROPIC_AUTH_TOKEN` in `<workspace>/.deepsec/.env.local` (gitignored) or export it in your shell before launching Cursor. The `install_plan.credentials` block lists the URLs to acquire each. |

**Cost guardrail:** the wrapper always passes `--limit` (default **50**, max **500**). Raise only after a successful calibration run. The DeepSec FAQ ballparks ~$25–60 per 100 files at Opus defaults — **verify against current pricing**.

---

## `shannon_pentest` refuses to start a pentest

`shannon_pentest` is intentionally strict. Use `action=status` first; it lists exactly what is blocking.

| Block reason | Fix |
|--------------|-----|
| `Docker is not available` | Install Docker Desktop / Engine. Shannon manages its own internal containers. |
| `Node X detected; Shannon requires Node 18+` | Install Node 18+ (see `install_plan`). |
| `No Anthropic-compatible credential found in process env` | Export `ANTHROPIC_API_KEY` (native) **or** `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` for OpenRouter / Vercel AI Gateway proxy mode. See `docs/FREE_VS_PAID_LLM.md` §3.2. |
| `Target classification rejected: Host "..." looks production-like` | Use a containerized disposable target (e.g., `npm run demo:webapp` URL). Hosts matching `/prod|production|live|admin|internal/` are blocked by design. |
| `repo_path does not exist` / `is not a directory` | Pass `repo_path` to a real source folder (defaults to `workspaceRoot`). |

**Safe dry run:** `shannon_pentest action=pentest target_url=... dryRun=true` returns the exact command without spawning it.

---

## `llamafirewall_advisor` says "workspace did not look agentic"

The advisor scans `requirements.txt`, `pyproject.toml`, and `setup.cfg` for hints like `langchain`, `langgraph`, `openai`, `llama-index`, `crewai`, `autogen`. If your project does not use those names yet, the advisor reports `agentic_signals.agentic = false`. You can still:

- Run `action=install_plan` to install `llamafirewall>=1.0.3` and download Meta's local models.
- Run `action=snippet` to get the Python integration; paste it into your agent code anyway if you are introducing LLM behaviour.

The advisor never installs or executes anything — it only reads and recommends.

---

## Rules never show up

Layer 1/2 rules are **`.mdc` files** under the plugin’s `rules/` directory. They apply when Cursor loads the plugin and the rule’s `globs` / `alwaysApply` match the editor context. If you only installed MCP manually but did not install/enable the **plugin**, rules bundled in the plugin will not attach.

---

## Docker demo: `port is already allocated`

**First try:** from the Security Gate repo root run **`npm run demo:up`** — it picks **two free host ports** and prints `http://127.0.0.1:…` URLs (no YAML, no guessing). Stop with **`npm run demo:down`**.

**Cause (raw `docker compose` only):** another process or container is already bound to the **host** port Compose wants.

**Defaults (root `docker-compose.yml`) when you do not use `demo:up`:**

| Service        | Default host → container | Override env var              |
|----------------|--------------------------|-------------------------------|
| `webapp-target` | `23000` → `80`           | `SECURITY_GATE_WEBAPP_PORT`   |
| `agent-target`  | `18501` → `8501`         | `SECURITY_GATE_AGENT_PORT`    |

```bash
SECURITY_GATE_WEBAPP_PORT=3001 SECURITY_GATE_AGENT_PORT=8511 docker compose up -d webapp-target agent-target
```

Then open `http://localhost:3001` and `http://localhost:8511`. See **`README.md`** (Demo targets).

**Do not paste YAML** (`ports:` / `- "23000:80"`) into your shell — those lines belong in `docker-compose.yml` only. Use **`npm run demo:up`** or **environment variables** to change published ports.

**Note:** `demo:up` uses Node’s ephemeral bind to **probe** free ports, then passes them to Compose — URLs change each run. Raw compose defaults (**23000** / **18501**) stay predictable for advanced users.

---

## Docker demo: stale image after editing `demo/*/Dockerfile`

Compose may reuse cached layers. After you change a demo `Dockerfile` or app files that affect the image, rebuild:

```bash
docker compose build --no-cache webapp-target agent-target
```

Or tear down and bring demos back with **`npm run demo:down`** then **`npm run demo:up`** (or `demo:webapp` / `demo:agent` for a single target).

---

## Still stuck

| Resource | Use for |
|----------|---------|
| [`SETUP.md`](../SETUP.md) | Install order, workspace vs MCP path |
| [`README.md`](../README.md) | Tool table, architecture overview |
| [`API_KEY_ACQUISITION.md`](API_KEY_ACQUISITION.md) | Keys vs free feeds for bundled MCP |
| [`TECHNICAL_DEEP_DIVE.md`](TECHNICAL_DEEP_DIVE.md) | Implementation details, extension points |

Open an issue with: OS, Cursor rough version, whether MCP appears in settings, output of `cd mcp-server && npm run smoke`, and whether your workspace root contains `mcp-server/`.
