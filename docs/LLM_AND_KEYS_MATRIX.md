# LLM and API keys matrix (canonical)

Security Gate’s **default GitHub-facing documentation is English**. This file is the single matrix for **which optional tool needs which credentials**. Env var names stay ASCII; never paste secrets into chat.

| MCP tool | API key required? | Typical providers | Environment variables |
|----------|--------------------|--------------------|------------------------|
| `intel_refresh` | No | Public HTTPS (CISA KEV, OSV) | None |
| `layer2_brief` | No | Reads local cache | None |
| `handbrake_scan` | No | Local `.env*` + process env | None |
| `project_profile` | No | Local files | None |
| `semgrep_scan` | No | Host Semgrep CE or Docker `semgrep/semgrep:latest` | None |
| `lab_bootstrap` (semgrep-lab) | No | Docker only | None |
| `lab_bootstrap` (crucible-lab) | **Yes** (when running attacks) | OpenAI, Anthropic, Groq | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` |
| `shannon_pentest` | **Yes** (`action=pentest`) | Anthropic, or OpenRouter / Vercel AI Gateway as Anthropic-compatible | `ANTHROPIC_API_KEY` **or** `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` |
| `deepsec_review` | **Yes** (`action=scan`) | Vercel AI Gateway (recommended) or Anthropic | `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` / `ANTHROPIC_AUTH_TOKEN` in `<workspace>/.deepsec/.env.local` |
| `llamafirewall_advisor` | No (core) | Local HF models | Optional: `TOGETHER_API_KEY`, `FIREWORKS_API_KEY` |

**Free vs paid LLM details:** [FREE_VS_PAID_LLM.md](FREE_VS_PAID_LLM.md)  
**Acquisition and hygiene:** [API_KEY_ACQUISITION.md](API_KEY_ACQUISITION.md)

**Spanish in Cursor:** you may chat in Spanish; the agent should answer in Spanish while citing **these English doc paths** and exact env var names above.
