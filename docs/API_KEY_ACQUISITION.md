# API Key Acquisition Guide (Multi-Provider)

All URLs and products change over time—**verify in your browser** if a link fails.

**Canonical mapping (tool × provider × env var):** [`docs/LLM_AND_KEYS_MATRIX.md`](LLM_AND_KEYS_MATRIX.md).

## Security Gate MCP (bundled in this repo)

The **`security-gate`** MCP server (`mcp-server/index.mjs`) does **not** read any vulnerability-provider API keys for the core flow. The exceptions are the three tools that wrap external LLM-consuming engines: **`deepsec_review`**, **`shannon_pentest`**, and `lab_bootstrap`'s **`crucible-lab`**. **`llamafirewall_advisor`** never needs a key (advisor only).

| Capability | Keys? | Notes |
|--------------|-------|--------|
| **`intel_refresh`** | No | Outbound **HTTPS** only: CISA KEV JSON + OSV `POST /v1/query`. Caches `kev.json`, `intel-meta.json`, `osv-samples.json` under `.security-gate/cache/`. MVP queries **npm** names from merged **`package.json`** `dependencies` / `devDependencies` only (not private registries or lockfile parsing). |
| **`layer2_brief`** | No | Reads the local cache + `project_profile`; no external calls. |
| **`handbrake_scan`**, **`project_profile`**, **`lab_bootstrap`** (semgrep-lab only), **`semgrep_scan`** | No | Env + filesystem + optional Docker locally. `semgrep_scan` uses the host Semgrep CE binary first and falls back to `semgrep/semgrep:latest` via Docker — no key required. |
| **`lab_bootstrap`** (crucible-lab only) | **Yes (only when running Crucible)** | One of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY`. Groq has a free tier — see `docs/FREE_VS_PAID_LLM.md` §3.3. |
| **`deepsec_review`** | **Yes (only for `action=scan`)** | One of `AI_GATEWAY_API_KEY` (Vercel AI Gateway, recommended), `VERCEL_OIDC_TOKEN` (re-pull every 12h via `npx vercel env pull`), or `ANTHROPIC_AUTH_TOKEN` (direct). Place in `<workspace>/.deepsec/.env.local` (already gitignored). `status` / `install_plan` / `init` / `report` work without keys. |
| **`shannon_pentest`** | **Yes (only for `action=pentest`)** | Anthropic-compatible: `ANTHROPIC_API_KEY` **or** `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` (OpenRouter `https://openrouter.ai/api/v1` for the free-tier route — see `docs/FREE_VS_PAID_LLM.md` §3.2). `status` / `install_plan` / `setup` / `report` work without keys. |
| **`llamafirewall_advisor`** | **No** | Advisor only. Core LlamaFirewall path is free (local HF models); optional `TOGETHER_API_KEY` / `FIREWORKS_API_KEY` are user-side, not consumed by the MCP. |

`intel-meta.json` may mention **`NVD_API_KEY`** as a **placeholder for future work**; the shipped server **does not** call the NVD API yet (see `docs/ROADMAP.md` → NVD join).

The official **`semgrep mcp`** subcommand requires Semgrep's **Pro Engine** (paid). The standalone OSS Docker image `ghcr.io/semgrep/mcp` / PyPI `semgrep-mcp` was deprecated in Semgrep v0.9.0 and now only returns a `deprecation_notice` tool. Security Gate ships its own **`semgrep_scan`** MCP tool to cover the OSS path without paid licensing. See `docs/TROUBLESHOOTING.md` → “Semgrep MCP says Pro Engine required”.

## Quick reference table

| Tool | API key required? | Where to get it | Typical cost | Environment variable(s) |
|------|-------------------|-------------------|--------------|-------------------------|
| **Semgrep OSS (Community Edition)** | No | Install locally — [Semgrep docs](https://semgrep.dev/docs) (`brew install semgrep` / `pip install semgrep`); or rely on the Docker fallback inside `semgrep_scan` / the `semgrep/semgrep:latest` image used by `lab_bootstrap` | Free | N/A |
| **Semgrep Pro (`semgrep mcp` subcommand)** | Yes (paid) | [Semgrep AppSec Platform](https://semgrep.com/products/community-edition) — Pro Engine binary required by the `mcp` subcommand | Paid plan | N/A (license is bound to the binary, not an env var) |
| **OSV** | No | Public API — [OSV](https://osv.dev/) | Free | N/A |
| **CISA KEV** | No | Public JSON feed — [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Free | N/A |
| **NVD** | Optional (for *your* integrations or a future Security Gate build) | [Request NVD API key](https://nvd.nist.gov/developers/request-an-api-key) | Free | `NVD_API_KEY` (not read by the current MVP server) |
| **Shannon** | Yes (for `shannon_pentest action=pentest`) | [Anthropic Console](https://console.anthropic.com/) (recommended), or [OpenRouter](https://openrouter.ai/keys) as Anthropic proxy, or AWS Bedrock / Google Vertex | Pay-as-you-go (or OpenRouter free with 50 req/day cap) | `ANTHROPIC_API_KEY` **or** `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` |
| **Crucible** | Yes | [OpenAI keys](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), or [Groq](https://console.groq.com/) | Pay-as-you-go | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` |
| **LlamaFirewall** | No (core) | [Hugging Face](https://huggingface.co/) for local models | Free core | Optional: `TOGETHER_API_KEY`, `FIREWORKS_API_KEY` |
| **DeepSec** | Yes (for `deepsec_review action=scan`) | [Vercel AI Gateway](https://vercel.com/ai-gateway) (recommended) or direct Anthropic | See DeepSec FAQ / pricing (**Confidence: Med**, ~$25–60 / 100 files Opus default) | `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` / `ANTHROPIC_AUTH_TOKEN` |

## Step-by-step narrative

1. **Tier 1 / intel without keys:** install Semgrep CE (`brew install semgrep` / `pip install semgrep`) **or** run Docker so the bundled `semgrep_scan` tool can use the `semgrep/semgrep:latest` fallback; run **`intel_refresh`** when outbound HTTPS is allowed so OSV + KEV data lands in `.security-gate/cache/`; then **`layer2_brief`** for planning context. No API keys are involved in that path.
2. **NVD (prepare for later):** request a key, confirm email (check spam), then `export NVD_API_KEY="..."` in environments where you will run **custom** NVD scripts or when a future Security Gate release ingests NVD (see roadmap). The **current** `mcp-server` build does not consume this variable.
3. **Shannon / Crucible:** create a provider key with least privilege; store in a local `.env` **never committed**, or in your private Cursor MCP config. For a **free** path, see `docs/FREE_VS_PAID_LLM.md` (OpenRouter as Anthropic proxy for Shannon; Groq free tier for Crucible).
4. **DeepSec (via `deepsec_review` MCP tool):** run `action=install_plan` to confirm Node 22+ / pnpm, then `action=init` once per workspace, then `action=scan` with the default `limit=50`. The tool refuses to call `scan` unless one of `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` / `ANTHROPIC_AUTH_TOKEN` is set. Consider Sonnet-class models when available to reduce cost (**Confidence: Med**).
5. **LlamaFirewall:** run vendor `configure` flow to download local models; paid scanners stay optional.

## Security hygiene

- Never paste keys into public chats or issues.  
- Prefer OS keychain / secret manager for CI.  
- Rotate keys if leaked.
