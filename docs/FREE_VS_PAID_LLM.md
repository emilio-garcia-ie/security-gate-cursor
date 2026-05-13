# Security Gate — Free vs paid LLM options (honest matrix)

Security Gate's **core flow** (Layer 1 rules, `handbrake_scan`, `project_profile`, `intel_refresh`, `layer2_brief`, `lab_bootstrap`'s `semgrep-lab`, **`semgrep_scan`**, `llamafirewall_advisor`) does **not** consume LLM tokens — it runs against public feeds (CISA KEV, OSV), local code, and Semgrep Community Edition rules. **No key is needed for that path.**

Tokens enter the picture only when you escalate to:

- **Crucible** (`lab_bootstrap` `crucible-lab`) — agentic attacker LLM,
- **Shannon** (`shannon_pentest`) — autonomous web/API pentester,
- **DeepSec** (`deepsec_review`) — Anthropic-class deep review.

This document gives you **honest** wiring options, including a 100%-free local path and free-tier cloud routes — plus the trade-offs.

---

## 1) Quick decision matrix

| Tool | 100% free local | Free cloud | Paid (recommended) | Notes |
|------|-----------------|------------|--------------------|-------|
| **Crucible** | ❌ (model size + tool-calling needs) | ✅ Groq free tier (`GROQ_API_KEY`) | ✅ Anthropic / OpenAI | Crucible natively supports `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY`. Groq is the easiest free path. |
| **Shannon** | ❌ | ⚠️ OpenRouter free via `ANTHROPIC_BASE_URL` (rate limits + quality caveats) | ✅ Anthropic (vendor default) | Shannon's prompts target Anthropic-class reasoning. Free OpenRouter works technically but quality and rate limits will bite. |
| **DeepSec** | ❌ | ⚠️ OpenRouter free / Vercel AI Gateway free tier | ✅ Anthropic via AI Gateway | DeepSec was built around Anthropic Claude. Free routes work for **calibration** runs only. |
| **LlamaFirewall** | ✅ **Yes — local HF models** (Prompt Guard 2 BERT, CodeShield) | N/A | Optional: `TOGETHER_API_KEY` / `FIREWORKS_API_KEY` for accelerated scanners | Core path is free; first import downloads ~hundreds of MB of model weights from Hugging Face. |
| **Cursor agent (LLM)** | Depends on your Cursor plan | N/A (Cursor manages) | Cursor pricing | Cursor uses its own model routing; Security Gate does not change that. |

Legend: ✅ recommended · ⚠️ works with caveats · ❌ not supported in MVP

---

## 2) 100% free local path (Ollama)

**When to use:** strict no-spend, no-key, no-network policies. Works for **LlamaFirewall** today; Shannon/DeepSec/Crucible **do not** support Ollama out of the box.

```bash
# macOS / Linux
brew install ollama   # or: curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull llama3.1:8b
ollama pull qwen2.5-coder:7b   # better for code/security reasoning
```

**Trade-offs:**

| Pro | Con |
|-----|-----|
| No keys, no tokens, no network. | Quality is **lower** than Claude / GPT-4 for chained security reasoning. |
| Full data sovereignty. | RAM-heavy: 8 GB minimum, 16 GB recommended. |
| Fits well with LlamaFirewall (also local). | No tool-calling support comparable to frontier models — Crucible / Shannon will likely under-perform. |

**Verdict:** great for LlamaFirewall, demos, and Layer 1/2 grounding via Cursor's own model picker. **Not viable** for Tier-2/3 attacks today.

---

## 3) Free cloud paths (with keys, but $0)

### 3.1 Google AI Studio (Gemini API)

- **Get a key:** https://aistudio.google.com/app/apikey → free `GEMINI_API_KEY`.
- **Free tier (May 2026):** Gemini 1.5/2.0 Flash → 15 RPM, 1M TPM, 1500 RPD; Gemini 2.0 Pro → 2 RPM, 50 RPD (verify against current Google docs — **Confidence: Med**).
- **Compatibility:** Gemini API is **not Anthropic-compatible** out of the box. It works for tools that explicitly support `GEMINI_API_KEY` (Cursor agent, your own scripts) — **not** directly with DeepSec / Shannon, which expect Anthropic shape.
- **Best use:** general agent answers, evidence summaries, planning briefs.

### 3.2 OpenRouter (Anthropic-compatible proxy)

- **Get a key:** https://openrouter.ai/keys → `OPENROUTER_API_KEY`.
- **Free models (May 2026):** 29 free routes (Llama 3.3 70B, Qwen3, Gemma, etc.); router `openrouter/free`.
- **Rate limits:** **50 req/day without deposit**, **1,000/day with $5 deposit**, **20 req/min** for free routes.
- **Anthropic-compatible wiring** (works for Shannon and DeepSec):

  ```bash
  export ANTHROPIC_BASE_URL="https://openrouter.ai/api/v1"
  export ANTHROPIC_AUTH_TOKEN="<your-openrouter-key>"
  export ANTHROPIC_MODEL="anthropic/claude-3.5-sonnet:free"   # or another :free route
  ```

  Then run `shannon_pentest action=status` or `deepsec_review action=status` — the wrappers accept the proxy combination.

- **Trade-offs:** rate caps interrupt long Shannon pentests; vendor (Keygraph / Vercel Labs) does not guarantee quality on non-Anthropic backends.

### 3.3 Groq free tier (Crucible)

- **Get a key:** https://console.groq.com/keys → `GROQ_API_KEY`.
- **Free models:** Llama 3.1 70B / 8B, Mixtral, Gemma — extremely fast.
- **Best use:** Crucible. Crucible accepts `GROQ_API_KEY` natively, so no proxy gymnastics.
- **Trade-offs:** Groq's free tier has model-specific RPM caps; long agentic attack loops may stall.

---

## 4) Paid (highest quality)

| Tool | Recommended provider | Env var(s) |
|------|----------------------|------------|
| Crucible | Anthropic (Claude Sonnet) or OpenAI | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| Shannon | Anthropic Claude Sonnet (vendor default) | `ANTHROPIC_API_KEY` |
| DeepSec | Vercel AI Gateway → Anthropic | `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`, or `ANTHROPIC_AUTH_TOKEN`) |
| LlamaFirewall | Local + optional accelerators | `TOGETHER_API_KEY` / `FIREWORKS_API_KEY` (optional) |

**Cost calibration:** DeepSec's FAQ ballparks ~$25–60 per 100 files at Opus defaults (verify against current pricing — **Confidence: Med**). Always run with the wrapper's default `limit=50` before raising.

---

## 5) Honest pros / cons

### Free-only stack (Ollama + Gemini + OpenRouter free)

**Pros**

- $0 monthly. Good for personal projects, demos, learning.
- LlamaFirewall fully covered.
- Crucible workable via Groq free.

**Cons**

- Shannon / DeepSec quality drops noticeably. Vendor support is best-effort.
- Rate limits will stop you mid-pentest. Plan calibration runs first.
- Less consistent multi-turn reasoning — Tier-3 deep review is the area that suffers most.

### Paid stack (Anthropic for Shannon + DeepSec, OpenAI/Groq for Crucible)

**Pros**

- Vendor-recommended, highest-quality results.
- Predictable behaviour for demos / production triage.
- Fewer surprises in long agentic loops.

**Cons**

- Real $ usage; always calibrate with small `--limit` before broad runs.
- Subscription / key management overhead.

### Hybrid (recommended for first-week demos)

| Tool | Recommended wiring |
|------|--------------------|
| LlamaFirewall | **Free local (HF models).** |
| Crucible | **Free Groq** for calibration; switch to Anthropic if results look weak. |
| Shannon | **Free OpenRouter** for the demo recording; **Anthropic** when you trust the target. |
| DeepSec | **Vercel AI Gateway free tier** for the first scan; **Anthropic** once you've validated `limit=50` output. |

---

## 6) How Security Gate enforces this

- All four LLM-consuming tools (`shannon_pentest`, `deepsec_review`, the Crucible service in `lab_bootstrap`, and any external LLM you wire) gate behind `handbrake_scan`. If the workspace looks production-like, dynamic flows are blocked regardless of which key you provided.
- `shannon_pentest` and `deepsec_review` **never auto-run** the destructive action. The caller must pass `action=pentest` / `action=scan` explicitly, and credentials are checked at run time.
- `llamafirewall_advisor` is read-only — it returns code snippets for you to paste; it never installs or executes anything.

Use the matrix above to pick the cheapest viable path **for the maturity of your target**.
