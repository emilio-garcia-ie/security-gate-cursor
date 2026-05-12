# Security Gate — Troubleshooting (MCP, hooks, smoke)

Use this when something “should work” after [`SETUP.md`](../SETUP.md). Keep [`VIBECODER_QUICKSTART.md`](VIBECODER_QUICKSTART.md) open for the happy path.

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

## `lab_bootstrap` says Docker missing / compose fails

- Install **Docker Desktop** (macOS/Windows) or **Docker Engine + Compose v2** (Linux).
- **`lab_bootstrap`** runs compose from the **plugin repo root** (where `docker-compose.lab.yml` lives), not from your app — that path is wired in code (`PLUGIN_ROOT`).
- **Windows:** ensure the drive containing `LAB_WORKSPACE` is shared with Docker (Docker Desktop → Settings → Resources → File sharing).
- Use `action=install_plan` first for copy-paste install hints when Docker is not installed.

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

## Still stuck

| Resource | Use for |
|----------|---------|
| [`SETUP.md`](../SETUP.md) | Install order, workspace vs MCP path |
| [`README.md`](../README.md) | Tool table, architecture overview |
| [`API_KEY_ACQUISITION.md`](API_KEY_ACQUISITION.md) | Keys vs free feeds for bundled MCP |
| [`TECHNICAL_DEEP_DIVE.md`](TECHNICAL_DEEP_DIVE.md) | Implementation details, extension points |

Open an issue with: OS, Cursor rough version, whether MCP appears in settings, output of `cd mcp-server && npm run smoke`, and whether your workspace root contains `mcp-server/`.
