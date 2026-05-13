# Security Gate — FAQ (conceptual)

Short answers for **what this is and why it works this way**. If your MCP fails to start, a port is busy, or Semgrep errors out, use **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** instead (operational fixes).

---

## What is Security Gate in one sentence?

A **Cursor plugin** bundle: **rules** (secure coding + dependency manifests), a **planning** rule (evidence-first), and an **MCP server** that coordinates scanners and **blocks dynamic testing** when the workspace looks production-like.

---

## What are the “three layers”?

1. **Layer 1 — Rules:** `.mdc` files nudge the agent toward safer patterns before code is written (including **`rules/supply-chain.mdc`** when you touch manifests or lockfiles).  
2. **Layer 2 — Planning:** a planning rule asks for risks **grounded** in project signals and (when refreshed) **KEV/OSV** cache.  
3. **Layer 3 — Orchestration:** MCP tools run Semgrep, refresh intel, bootstrap a lab, or call Shannon/DeepSec — with **`handbrake_scan`** gating the dangerous paths.

Diagrams: [ARCHITECTURE_AND_FLOWS.md](ARCHITECTURE_AND_FLOWS.md).

---

## Do I need API keys to try Security Gate?

**No** for the core Tier-1 path: `handbrake_scan`, `project_profile`, `intel_refresh` (needs HTTPS), `layer2_brief`, `semgrep_scan` (OSS CE or Docker), and `llamafirewall_advisor` (advisor text).

**Yes** when you actually run **Shannon pentest**, **Crucible attacks**, or a **DeepSec scan** — those call LLM-backed backends. See [FREE_VS_PAID_LLM.md](FREE_VS_PAID_LLM.md) and [LLM_AND_KEYS_MATRIX.md](LLM_AND_KEYS_MATRIX.md).

---

## What is “static” vs “dynamic” here?

- **Static:** analysis that does not **attack a running URL** or run an **autonomous exploit loop** (Semgrep, rules, intel cache, DeepSec `status`/`install_plan`, Shannon `dryRun`, etc.).  
- **Dynamic:** Shannon/Crucible-style live exercises or DeepSec **scan** — must target **disposable** infra and respect **`handbrake_scan`**.

---

## Why does `handbrake_scan` sometimes say `dynamic_allowed: false`?

Because merged **environment** and workspace `.env*` files contain **production-like signals** (for example `NODE_ENV=production`, or a non-local database host). Tier-1 static work can continue; the plugin should **not** encourage live exploitation against that environment.

---

## Can I use OpenRouter or Groq instead of paid Anthropic/OpenAI?

Often **yes** for wiring experiments:

- **Shannon / DeepSec:** Anthropic-**compatible** base URL + token (see [FREE_VS_PAID_LLM.md](FREE_VS_PAID_LLM.md) §3.2). Quality and rate limits vary.  
- **Crucible:** native `GROQ_API_KEY` / OpenAI / Anthropic keys — Groq free tier is a common budget path (see §3.3).

---

## Where do outputs go?

- MCP responses return **JSON or markdown** in chat.  
- `intel_refresh` writes under **`.security-gate/cache/`**.  
- Shannon / DeepSec write under **`.shannon/`** and **`.deepsec/`** respectively (see [ARCHITECTURE_AND_FLOWS.md](ARCHITECTURE_AND_FLOWS.md)).  
- **`npm run report:export`** writes a markdown report under **`.security-gate/reports/`**.

---

## Why not use Semgrep’s official MCP server?

The **`semgrep mcp`** subcommand targets Semgrep’s **Pro Engine** (paid). The OSS `ghcr.io/semgrep/mcp` image was **deprecated** and no longer performs scans. This repo ships **`semgrep_scan`** wrapping **Community Edition** on the host or in Docker. Details: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) (Semgrep MCP section).

---

## Where is the full technical detail?

- [TECHNICAL_DEEP_DIVE.md](TECHNICAL_DEEP_DIVE.md) — implementation and extension points.  
- [CONFIGURATION_MAP.md](CONFIGURATION_MAP.md) — where every config file lives.  
- [SETUP.md](../SETUP.md) — install order and smoke tests.
