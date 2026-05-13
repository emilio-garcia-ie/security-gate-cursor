# Security Gate — Vibecoder Quickstart (English)

**Big picture (diagrams + flows):** start with [`ARCHITECTURE_AND_FLOWS.md`](ARCHITECTURE_AND_FLOWS.md); quick questions → [`FAQ.md`](FAQ.md).

This path is for builders who want **simple steps** and **plain language**. It works on **macOS**, **Windows**, and **Linux** — install steps differ slightly; see `SETUP.md` for copy-paste commands per OS.

## What you get

- Safer coding defaults (rules)
- A checklist mindset before risky changes (planning rule)
- A button-like workflow in Cursor via MCP tools:
  - “Is it safe to run scary tests?” (`handbrake_scan`)
  - “What does my project roughly look like to a security tool?” (`project_profile`)
  - “Refresh known vulnerability notes” (`intel_refresh` → `layer2_brief`)
  - “Spin up isolated scanners in Docker” (`lab_bootstrap`, optional)

## 1) Install the plugin (local)

Ask a developer to do this once:

### macOS / Linux

```bash
cd /path/to/security-gate-cursor
mkdir -p ~/.cursor/plugins/local
ln -s "$(pwd)" ~/.cursor/plugins/local/security-gate
```

### Windows

If symlink does not work, **copy** the whole folder into:

`%USERPROFILE%\.cursor\plugins\local\security-gate`

Example from **inside** the repo folder (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.cursor\plugins\local" | Out-Null
Copy-Item -Recurse -Force . "$env:USERPROFILE\.cursor\plugins\local\security-gate"
```

Then restart Cursor.

## 1b) One-line setup (developers)

From the cloned repo root:

```bash
npm run onboard
```

Use `--dry-run` to preview, `--locale=es` for Spanish messages, or `--keys` for optional API key hints. Full mapping: `docs/LLM_AND_KEYS_MATRIX.md`.

## 2) Turn on Node for the security helper

The helper uses Node.js **18.18+**.

## 3) Run the “safety check” before anything intense

In Cursor, use the MCP tool:

- **`handbrake_scan`**

If it says dynamic testing is **not allowed**, that is intentional. Do not run live hacking tools against that setup.

## 3b) Optional: quick project fingerprint

In Cursor, run MCP tool **`project_profile`** if you want a plain-language summary of what the repo “looks like” to the tool (languages, frameworks, rough hints).

## 4) Optional: refresh known issue notes

Run:

- **`intel_refresh`**

Then ask the agent to run:

- **`layer2_brief`**

You should see **facts from the local cache**, not guesses: a **CISA KEV** snapshot summary (full catalog cached for context) plus **npm OSV** rows from `package.json` — the tool does **not** merge KEV with each dependency line-by-line in MVP. Run **`intel_refresh` first** so `.security-gate/cache/` is populated.

## 4b) Optional: isolated Semgrep + Crucible (Docker)

If you have **Docker Desktop / Engine** working, run MCP tool **`lab_bootstrap`**:

- `action=install_plan` — copy-paste hints if Docker or Python is missing (macOS / Windows / Linux).
- `action=start` (or `action=status` with `autoStartIfReady=true`) — pulls/builds containers for Tier-1 Semgrep + Crucible CLI (see `SETUP.md` → Scanner lab).

## 5) Demo apps (optional)

To try the **bundled vulnerable demo apps** in Docker (“digital cage”), from the repo root:

```bash
npm run clone-demo-targets
docker compose up -d webapp-target
```

(On macOS/Linux you can use `./scripts/clone-demo-targets.sh` instead if you prefer Bash.)

Prefer **`npm run demo:webapp`** / **`npm run demo:agent`** for auto-picked ports — see the [README](../README.md) **Demo targets** section.

This keeps the risky app in a container.

## 6) API keys (only if you use paid tools)

If you later connect Shannon / Crucible / **DeepSec via `deepsec_review`** / optional scanners, you will need API keys. Security Gate's core flow (Layer 1 rules, `project_profile`, `intel_refresh`, `layer2_brief`, **`semgrep_scan`**, `handbrake_scan`, `lab_bootstrap`'s `semgrep-lab`) does **not** require any key.

Start here:

- OpenAI: `https://platform.openai.com/api-keys`
- Anthropic: `https://console.anthropic.com/`
- Groq: `https://console.groq.com/`
- Vercel AI Gateway (often used for DeepSec setups): `https://vercel.com/docs/ai-gateway` (**Confidence: Med** — verify current product naming/URLs in your month/year)

**Semgrep / OSV / CISA KEV**: no key required for **`intel_refresh`** / **`layer2_brief`** in this template (public HTTPS feeds + cache under `.security-gate/cache/`).

**NVD**: you can request a free API key for higher rate limits when calling the NVD API yourself (`https://nvd.nist.gov/developers/request-an-api-key`). The **bundled `mcp-server` today does not read `NVD_API_KEY`** or ingest NVD; that is roadmap work (`docs/ROADMAP.md`, `docs/API_KEY_ACQUISITION.md`).

## Need technical detail?

Open [`TECHNICAL_DEEP_DIVE.md`](TECHNICAL_DEEP_DIVE.md) and [`ARCHITECTURE_AND_FLOWS.md`](ARCHITECTURE_AND_FLOWS.md) for diagrams and outputs.
