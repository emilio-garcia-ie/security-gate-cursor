---
name: security-gate
description: Run Security Gate workflows (handbrake, profiling, intel refresh, Layer 2 briefing, scanner lab bootstrap) using the bundled MCP server and rules.
---

# Security Gate (Cursor Skill)

## What this is

Security Gate implements a **three-layer** model:

1. **Layer 1 — Rules**: `.mdc` rules under `rules/` steer secure defaults before code is written.
2. **Layer 2 — Planning**: `rules/security-planning.mdc` forces evidence-grounded risk analysis before risky edits.
3. **Layer 3 — Orchestration**: the `security-gate` MCP server coordinates external tooling and **blocks dynamic testing** when a production-like environment is detected.

## Prerequisites

- **Supported OS**: macOS, Windows 10/11, or Linux — Node **18.18+** on `PATH` for the MCP server and hooks; Git on `PATH` for demo clones; Docker for labs and demos.
- Optional: `semgrep` installed locally for Tier 1 static scans (`pip install semgrep` or Semgrep installers).
- Optional: API keys for dynamic/deep tools (see `README.md` and `docs/VIBECODER_QUICKSTART.md`).

## Invisible mode (vibecoders)

Explain progress in plain language:

- “Checking whether it is safe to run live tests…”
- “Scanning dependencies for known issues…”
- “Static checks only in production-like setups.”

Hide tier numbers unless the user asks for technical detail.

## Typical workflow

1. Ask the user to confirm the **workspace root** (the opened repository).
2. Call MCP tool **`handbrake_scan`** before any dynamic testing request (Shannon/Crucible/etc.).
3. Call **`project_profile`** to detect stack signals.
4. Call **`intel_refresh`** periodically (weekly) or on first run; then use **`layer2_brief`** for a short, evidence-first markdown brief (**stack + cached KEV summary + npm OSV subset**). In MVP, KEV is **not** auto-correlated to each OSV row — use both for triage.
5. If the user wants containerized Tier-1 / agentic CLI tooling without host installs, call **`lab_bootstrap`** (`action=install_plan` first if Docker is missing) and then `action=start` with `autoStartIfReady=true` once Docker is running.
6. Only if `handbrake_scan` reports `dynamic_allowed: true`, discuss running dynamic tools against **disposable** environments (Docker targets).

## Hard safety rule

If `handbrake_scan` reports production-like signals:

- Do **not** run Shannon, Crucible, or other live exploit tooling.
- Allow **Tier 1 static** analysis only (e.g., Semgrep reading source code).

## ISO 27001-friendly outputs

When generating summaries for auditors, include:

- what was scanned
- when
- what was blocked and why
- what findings remain open

Map open items to Annex A style controls qualitatively (not a certification claim).

## References

- `docs/TECHNICAL_DEEP_DIVE.md`
- `docs/VIBECODER_QUICKSTART.md`
- `README.md` decision diagram
