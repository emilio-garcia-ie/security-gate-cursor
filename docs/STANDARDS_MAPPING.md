# Security Gate — Standards mapping (OWASP & ISO 27001)

This document is a **qualitative mapping** between Security Gate and well-known security frameworks. It is **not** a certification, audit, or compliance attestation. It exists so that engineers, reviewers, and judges can see at a glance which categories Security Gate **helps with** and which require additional process or tooling.

References (authoritative sources):

- [OWASP Top 10 — 2021](https://owasp.org/Top10/)
- [OWASP API Security Top 10 — 2023](https://owasp.org/API-Security/editions/2023/en/0x00-toc/)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OWASP Agentic AI — Threats and Mitigations](https://genai.owasp.org/) (project family)
- [ISO/IEC 27001:2022 (informational)](https://www.iso.org/standard/27001) and the [Annex A controls reference](https://www.iso.org/standard/82875.html)

---

## 1) Scope and honest limits

**Security Gate helps with (today, MVP):**

- Steering secure defaults **before** code is written (Layer 1 rules: `rules/security.mdc`, `rules/supply-chain.mdc` for manifests/lockfiles, `rules/onboarding-and-keys.mdc`).
- Forcing evidence-aware planning **before** risky edits (Layer 2 planning rule + `layer2_brief`).
- Orchestrating safer dynamic testing only against **disposable** environments (Layer 3 MCP: `handbrake_scan`, `project_profile`, `intel_refresh`, `layer2_brief`, `lab_bootstrap`, `semgrep_scan`, `deepsec_review`, `shannon_pentest`, `llamafirewall_advisor`).

**Security Gate does *not*:**

- Run an automatic Top-10 compliance check.
- Issue certifications, audit opinions, or controls attestations.
- Replace a Semgrep / DAST / SCA pipeline in CI (those are complementary).

Use the tables below as a **starting point** for in-house mapping work, not as evidence of conformance.

---

## 2) OWASP Top 10 — 2021 (web apps)

| Category | What Security Gate contributes |
|----------|-------------------------------|
| **A01:2021 Broken Access Control** | Planning rule asks for trust boundaries + authorization tests; rules push “validate and authorize every request”. |
| **A02:2021 Cryptographic Failures** | Layer 1 rule blocks logging of secrets/tokens and pushes safe defaults; planning rule asks for crypto-relevant residual risk. |
| **A03:2021 Injection** | Layer 1 rule mandates parameterized queries and discourages `eval` / unsafe HTML rendering. `semgrep_scan` (bundled OSS wrapper) catches code-level patterns; `lab_bootstrap` `semgrep-lab` gives the same in a Docker sandbox. |
| **A04:2021 Insecure Design** | Layer 2 planning rule (threat model + top-5 risks + tests) is exactly this category. |
| **A05:2021 Security Misconfiguration** | `handbrake_scan` flags production-like environment misuse; planning rule asks for misconfig review. |
| **A06:2021 Vulnerable and Outdated Components** | `intel_refresh` + `layer2_brief` surface OSV/CISA KEV signals for the workspace `package.json`. Lockfile-wide coverage is roadmap. |
| **A07:2021 Identification and Authentication Failures** | Layer 1 rule on cookies, sessions, and least privilege; planning rule asks for auth/AuthN edges. |
| **A08:2021 Software and Data Integrity Failures** | Rules push pinned dependencies, no random install scripts, no unsafe deserialization. |
| **A09:2021 Security Logging and Monitoring Failures** | Layer 1 rule mandates structured, secret-free security logs. Full SIEM/monitoring is out of scope. |
| **A10:2021 Server-Side Request Forgery (SSRF)** | Planning rule asks for outbound-IO review; static rules can be added per-stack. |

---

## 3) OWASP API Security Top 10 — 2023

| Category | What Security Gate contributes |
|----------|-------------------------------|
| **API1:2023 Broken Object Level Authorization** | Planning rule (authorization edges) + Layer 1 “treat IDs as untrusted”. |
| **API2:2023 Broken Authentication** | Layer 1 rule on credentials and cookies; planning rule on AuthN. |
| **API3:2023 Broken Object Property Level Authorization** | Planning rule (mass assignment / property exposure). |
| **API4:2023 Unrestricted Resource Consumption** | Planning rule asks for abuse cases; rate limits / quotas remain implementation work. |
| **API5:2023 Broken Function Level Authorization** | Planning + Layer 1 “authorize every request”. |
| **API6:2023 Unrestricted Access to Sensitive Business Flows** | Planning rule asks for sensitive flow review. |
| **API7:2023 Server Side Request Forgery** | Same as A10:2021. |
| **API8:2023 Security Misconfiguration** | `handbrake_scan` + planning rule. |
| **API9:2023 Improper Inventory Management** | Layer 1 rule on inventory; OSV data via `intel_refresh`. Full inventory hygiene is roadmap. |
| **API10:2023 Unsafe Consumption of APIs** | Layer 1 rule (untrusted input) + planning rule on third-party trust. |

---

## 4) OWASP Top 10 for LLM Applications

| Category | What Security Gate contributes |
|----------|-------------------------------|
| **LLM01 Prompt Injection** | Layer 1 rule on agent prompt isolation; demo `agent-target` exercises the failure mode end-to-end. |
| **LLM02 Insecure Output Handling** | Layer 1 rule pushes context-escaping; planning rule covers output paths. |
| **LLM03 Training Data Poisoning** | Out of MVP scope; documented as such. |
| **LLM04 Model Denial of Service** | Planning rule asks for abuse cases (rate, budget). |
| **LLM05 Supply Chain Vulnerabilities** | `intel_refresh` (OSV/KEV) + Layer 1 pinned deps. |
| **LLM06 Sensitive Information Disclosure** | Layer 1 rule (no secrets in prompts, no PII logging). |
| **LLM07 Insecure Plugin Design** | Layer 1 “least privilege for tools”; planning rule asks for tool scope. |
| **LLM08 Excessive Agency** | Planning rule pushes minimal tool surface + human-in-the-loop discussion. |
| **LLM09 Overreliance** | Layer 2 “evidence-first” brief enforces grounding, not LLM recall. |
| **LLM10 Model Theft** | Out of MVP scope. |

---

## 5) OWASP Agentic AI (concept-level)

The OWASP **Agentic AI** project tracks risks specific to autonomous agents (goal hijack, tool misuse, plan corruption, etc.). Security Gate aligns by:

- Requiring **`handbrake_scan`** before any dynamic / autonomous test loop.
- Routing agentic dynamic testing to **disposable environments** (Crucible image in `docker-compose.lab.yml` via **`lab_bootstrap`**).
- Encouraging **minimal tool authority** in Layer 1 rule for agents/LLM systems.

This is positioning, not a checklist conformance.

---

## 6) ISO/IEC 27001:2022 — qualitative Annex A alignment

**Reminder:** Security Gate is a developer tool, not an Information Security Management System (ISMS). The mapping below is **evidence-support** intended for internal audit prep — never as a conformance claim.

| Annex A control (2022) | How Security Gate can provide evidence |
|------------------------|----------------------------------------|
| **A.5.x Organizational policies** | `.cursor-plugin/plugin.json` + `rules/*.mdc` show codified security policy applied to AI-assisted development. |
| **A.8.8 Management of technical vulnerabilities** | `intel_refresh` artefacts (`kev.json`, `osv-samples.json`, `intel-meta.json`) + linkage to KEV/OSV. |
| **A.8.16 Monitoring activities** | Session-hint hook output, MCP JSON responses can be captured to logs/tickets. |
| **A.8.25 Secure development life cycle** | Layer 1 rules (`security.mdc`, `supply-chain.mdc`) + Layer 2 planning rule embed SDLC checks at the editor level. |
| **A.8.26 Application security requirements** | `rules/security-planning.mdc` requires threat-model + risk list before risky edits. |
| **A.8.28 Secure coding** | `rules/security.mdc` (injection, secrets, AuthN, logging) + `rules/supply-chain.mdc` (pinning, lockfiles, install-script hygiene, CI install commands). |
| **A.8.29 Security testing** | Pre-flight `handbrake_scan`; `semgrep_scan` for code-level checks; `lab_bootstrap` for disposable Semgrep/Crucible runs. |
| **A.8.31 Separation of environments** | `handbrake_scan` codifies the “no live tests in production-like envs” intent. |
| **A.8.32 Change management** | MCP JSON outputs + brief markdowns become artefacts attached to PRs. |
| **A.8.33 Test information** | Demo `cursor-webinar-sec` + `damn-vulnerable-llm-agent` provide disposable, non-production test data. |

For a full Annex A walkthrough you still need an internal control catalog + a person doing the mapping for **your** environment.

---

## 7) Practical workflow that produces standards-friendly artefacts

1. Open the target repo in Cursor.
2. **`handbrake_scan`** → JSON saved to a ticket (evidence for A.8.31 / A.5.x).
3. **`project_profile`** → captures the stack signals (auditor-friendly context).
4. **`intel_refresh`** → KEV/OSV cache files (evidence for A.8.8).
5. **`layer2_brief`** → markdown brief; ask the agent to tag each risk with an OWASP / ISO reference where it adds clarity.
6. Fixes are applied by the Cursor agent following the Layer 1 rules.
7. Re-scan (`semgrep_scan` or `lab_bootstrap`'s `semgrep-lab`) → resolved / open list; the agent can produce a closing markdown report referencing this mapping.

---

## 8) What is NOT covered (be explicit)

- No automated conformance checks against any standard.
- No coverage of physical / organizational controls outside the developer toolchain.
- No SCA across lockfiles for ecosystems beyond npm (roadmap).
- No NVD enrichment in MVP (`NVD_API_KEY` reserved for a future build — see `docs/ROADMAP.md`).
- No SIEM, no logging pipeline.

Treat this document as the **honest contract** between Security Gate and well-known frameworks.
