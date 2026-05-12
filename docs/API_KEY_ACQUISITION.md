# API Key Acquisition Guide (Multi-Provider)

All URLs and products change over time—**verify in your browser** if a link fails.

## Security Gate MCP (bundled in this repo)

The **`security-gate`** MCP server (`mcp-server/index.mjs`) does **not** read any vulnerability-provider API keys today.

| Capability | Keys? | Notes |
|--------------|-------|--------|
| **`intel_refresh`** | No | Outbound **HTTPS** only: CISA KEV JSON + OSV `POST /v1/query`. Caches `kev.json`, `intel-meta.json`, `osv-samples.json` under `.security-gate/cache/`. MVP queries **npm** names from merged **`package.json`** `dependencies` / `devDependencies` only (not private registries or lockfile parsing). |
| **`layer2_brief`** | No | Reads the local cache + `project_profile`; no external calls. |
| **`handbrake_scan`**, **`project_profile`**, **`lab_bootstrap`** | No | Env + filesystem + optional Docker locally. |

`intel-meta.json` may mention **`NVD_API_KEY`** as a **placeholder for future work**; the shipped server **does not** call the NVD API yet (see `docs/ROADMAP.md` → NVD join).

If you add the **Semgrep MCP** server separately in Cursor (e.g. streamable HTTP to `mcp.semgrep.ai`), follow **that** product’s auth model—this table below focuses on OSS / public feeds and common dynamic-testing tools.

## Quick reference table

| Tool | API key required? | Where to get it | Typical cost | Environment variable(s) |
|------|-------------------|-------------------|--------------|-------------------------|
| **Semgrep OSS** | No | Install locally — [Semgrep docs](https://semgrep.dev/docs); or run the **`semgrep/semgrep`** image via `lab_bootstrap` + `docker-compose.lab.yml` | Free | N/A |
| **OSV** | No | Public API — [OSV](https://osv.dev/) | Free | N/A |
| **CISA KEV** | No | Public JSON feed — [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Free | N/A |
| **NVD** | Optional (for *your* integrations or a future Security Gate build) | [Request NVD API key](https://nvd.nist.gov/developers/request-an-api-key) | Free | `NVD_API_KEY` (not read by the current MVP server) |
| **Shannon** | Yes (LLM provider) | [Anthropic Console](https://console.anthropic.com/) (recommended), or your AWS Bedrock / Google Vertex setup | Pay-as-you-go | `ANTHROPIC_API_KEY` (example) |
| **Crucible** | Yes | [OpenAI keys](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), or [Groq](https://console.groq.com/) | Pay-as-you-go | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` |
| **LlamaFirewall** | No (core) | [Hugging Face](https://huggingface.co/) for local models | Free core | Optional: `TOGETHER_API_KEY`, `FIREWORKS_API_KEY` |
| **DeepSec** | Often yes | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) or direct provider keys | See DeepSec FAQ / pricing (**Confidence: Med**) | e.g. `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |

## Step-by-step narrative

1. **Tier 1 / intel without keys:** install Semgrep if you want local static scans; run **`intel_refresh`** when outbound HTTPS is allowed so OSV + KEV data lands in `.security-gate/cache/`; then **`layer2_brief`** for planning context. No API keys are involved in that path.
2. **NVD (prepare for later):** request a key, confirm email (check spam), then `export NVD_API_KEY="..."` in environments where you will run **custom** NVD scripts or when a future Security Gate release ingests NVD (see roadmap). The **current** `mcp-server` build does not consume this variable.
3. **Shannon / Crucible:** create a provider key with least privilege; store in a local `.env` **never committed**, or in your private Cursor MCP config.
4. **DeepSec:** prefer a **small calibration run** (`--limit 50` style flags per vendor docs) before large passes; consider Sonnet-class models when available to reduce cost (**Confidence: Med**).
5. **LlamaFirewall:** run vendor `configure` flow to download local models; paid scanners stay optional.

## Security hygiene

- Never paste keys into public chats or issues.  
- Prefer OS keychain / secret manager for CI.  
- Rotate keys if leaked.
