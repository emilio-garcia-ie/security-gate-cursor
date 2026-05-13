---
name: security-gate
description: Run Security Gate workflows (handbrake, profiling, intel refresh, Layer 2 briefing, scanner lab bootstrap) using the bundled MCP server and rules.
---

# Security Gate (Cursor Skill)

## What this is

Security Gate implements a **three-layer** model:

1. **Layer 1 — Rules**: `.mdc` rules under `rules/` steer secure defaults before code is written (`security.mdc` for typical source files; `supply-chain.mdc` when manifests or lockfiles are in scope; `onboarding-and-keys.mdc` for setup/locale guidance).
2. **Layer 2 — Planning**: `rules/security-planning.mdc` forces evidence-grounded risk analysis before risky edits.
3. **Layer 3 — Orchestration**: the `security-gate` MCP server coordinates external tooling and **blocks dynamic testing** when a production-like environment is detected.

## Prerequisites

- **Supported OS**: macOS, Windows 10/11, or Linux — Node **18.18+** on `PATH` for the MCP server and hooks; Git on `PATH` for demo clones; Docker for labs and demos.
- Optional but recommended: install `semgrep` Community Edition locally (`brew install semgrep` / `pip install semgrep`) so the bundled `semgrep_scan` MCP tool uses the faster host path instead of the Docker fallback. Do **not** wire `"semgrep mcp"` as a user-level MCP — that subcommand requires the Pro Engine.
- Optional: API keys for dynamic/deep tools (see `README.md` and `docs/VIBECODER_QUICKSTART.md`).

## Invisible mode (vibecoders)

Explain progress in plain language:

- “Checking whether it is safe to run live tests…”
- “Scanning dependencies for known issues…”
- “Static checks only in production-like setups.”

Hide tier numbers unless the user asks for technical detail.

## Typical workflow

1. Ask the user to confirm the **workspace root** (the opened repository).
2. **Optional CLI:** from the Security Gate repo root, **`npm run onboard`** (or `node scripts/onboard.mjs`) performs a one-time local setup; **`npm run report:export`** writes `.security-gate/reports/FINAL_SECURITY_REPORT_*.md` for judges or auditors when you need a file artifact.
3. Call MCP tool **`handbrake_scan`** before any dynamic testing request (Shannon/Crucible/DeepSec/etc.).
4. Call **`project_profile`** to detect stack signals.
5. Call **`intel_refresh`** periodically (weekly) or on first run; then use **`layer2_brief`** for a short, evidence-first markdown brief (**stack + cached KEV summary + npm OSV subset**). In MVP, KEV is **not** auto-correlated to each OSV row — use both for triage.
6. For lightweight Tier-1 static checks, call **`semgrep_scan`** (`action=status` first to confirm engine; then `action=scan_path` for the workspace or `action=scan_text` for a generated snippet). This runs OSS Semgrep CE on the host or in Docker — no Pro Engine, no extra MCP entry.
7. If the user wants containerized Tier-1 / agentic CLI tooling without host installs, call **`lab_bootstrap`** (`action=install_plan` first if Docker is missing) and then `action=start` with `autoStartIfReady=true` once Docker is running.
8. For Tier-2 dynamic web/API pentests, call **`shannon_pentest`** in this order: `action=status` → `action=install_plan` → `action=setup` (once) → `action=pentest target_url=<disposable URL> [dryRun=true]` → `action=report`. The wrapper refuses production-looking hostnames and missing credentials; tell the user to use the local demo URLs (`npm run demo:webapp`).
9. For Tier-2.5 runtime defence, call **`llamafirewall_advisor`** (`status` → `install_plan` → `snippet`). Remind the user the advisor is read-only — they paste the snippet into their agent code themselves.
10. For Tier-3 deep review, call **`deepsec_review`** in this order: `action=status` → `action=install_plan` (if Node 22+/pnpm/credentials missing) → `action=init` (once) → `action=scan` (default `limit=50`) → `action=report`. Never raise the limit on the first run; always tell the user the cost calibration is intentional.
11. When the user asks for a **free** path, point them at [`docs/FREE_VS_PAID_LLM.md`](../../docs/FREE_VS_PAID_LLM.md): OpenRouter free as Anthropic proxy for Shannon/DeepSec, Groq free for Crucible, Ollama + LlamaFirewall local for guardrails. For every tool’s env vars in one table, use [`docs/LLM_AND_KEYS_MATRIX.md`](../../docs/LLM_AND_KEYS_MATRIX.md).
12. Only if `handbrake_scan` reports `dynamic_allowed: true`, discuss running dynamic tools against **disposable** environments (Docker targets).

## Hard safety rule

If `handbrake_scan` reports production-like signals:

- Do **not** run Shannon, Crucible, or other live exploit tooling.
- Allow **Tier 1 static** analysis only — `semgrep_scan` (host CE / Docker fallback) and the dependency intel cache. No live exploitation.

## Standards-friendly outputs (OWASP + ISO 27001)

When generating summaries for reviewers or auditors, include:

- what was scanned
- when
- what was blocked and why (cite `handbrake_scan` JSON when relevant)
- what findings remain open
- **framework hints** per finding (one of OWASP Top 10 / API Top 10 / LLM Top 10 / Agentic / ISO/IEC 27001:2022 Annex A — pick the one most useful per item, do not over-tag)
- a short **out-of-scope / next steps** section stating what Security Gate does **not** cover (e.g., NVD enrichment, organizational controls, full SIEM)

This is a **qualitative mapping**, not a certification claim. See [`../../docs/STANDARDS_MAPPING.md`](../../docs/STANDARDS_MAPPING.md) for the consolidated tables.

## References

- `docs/TECHNICAL_DEEP_DIVE.md`
- `docs/VIBECODER_QUICKSTART.md`
- `README.md` decision diagram
