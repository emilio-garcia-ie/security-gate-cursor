# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Security Gate is a Cursor IDE plugin with an MCP server. It is pure ESM JavaScript (`.mjs` files) — no build step, no TypeScript, no bundler. The only installable dependencies live in `mcp-server/`.

### Dependencies

- **Runtime:** Node.js >= 18.18 (Node 22+ recommended for DeepSec tool).
- **MCP server deps:** `cd mcp-server && npm install` — installs `@modelcontextprotocol/sdk` and `zod`. The root `package.json` has zero dependencies (only script aliases).

### Running and testing

- **Smoke tests (primary verification):** `cd mcp-server && npm run smoke:all` — runs entirely in-process via stdio, no external services needed. All sub-suites must exit 0.
- **Individual smoke suites:** `npm run smoke`, `smoke:prod`, `smoke:aux`, `smoke:deepsec`, `smoke:external`, `smoke:semgrep`, `smoke:onboard`, `smoke:report`. See `mcp-server/package.json` for the full list.
- **Intel smoke test (requires network):** `npm run smoke:intel` from `mcp-server/` — calls CISA KEV + OSV APIs.
- **MCP server manual test:** `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node mcp-server/index.mjs` — should return a JSON-RPC response with `serverInfo.name = "security-gate"`.
- **Onboard script:** `npm run onboard -- --dry-run` from repo root — verifies Node version, checks Docker/Semgrep, previews setup steps.
- **Report export:** `npm run report:export` from repo root — writes a markdown report to `.security-gate/reports/`.

### Gotchas

- **No lint/format/typecheck tooling** is configured. There is no ESLint, Prettier, or TypeScript in this project.
- **The MCP server communicates via stdio** (stdin/stdout JSON-RPC), not HTTP. It does not listen on a port.
- **Docker, Semgrep, Shannon, DeepSec, LlamaFirewall** are all optional. The smoke tests handle their absence gracefully — they report `docker_available: false` or `engine: none` but still pass.
- **`smoke:all` takes ~60 seconds** due to multiple sequential subprocess spawns.
- The `.security-gate/` directory is created at runtime for cache/reports and is in `.gitignore`.
- **Slack MCP** is available in Cursor but requires OAuth authentication via the Desktop IDE (Settings > MCP Servers). Cloud Agents cannot complete this flow — it must be done interactively by the user first.
