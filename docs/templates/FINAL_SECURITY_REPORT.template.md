# Final security report

**Generated:** {{GENERATED_AT}}  
**Workspace:** `{{WORKSPACE}}`

## Executive summary

Automated export from Security Gate. This report combines the production **handbrake** snapshot, optional **project** signals, cached **intel** (if present), and an optional **Semgrep** scan. It is **not** a certification against OWASP or ISO 27001 — see [STANDARDS_MAPPING.md](../STANDARDS_MAPPING.md) for qualitative mapping.

{{EXEC_SUMMARY}}

## Scope

- Handbrake: merged workspace `.env*` files with `process.env` (same logic as MCP `handbrake_scan`).
- Intel: reads `.security-gate/cache/` only (no network). Run `intel_refresh` separately to populate.
- Semgrep: optional `semgrep_scan` over a bounded path when the engine is available.

## Handbrake (production safety)

```json
{{HANDBRAKE_JSON}}
```

## Project signals (lightweight)

{{PROJECT_BLOCK}}

## Intel cache (local)

{{INTEL_BLOCK}}

## Semgrep (OSS, optional)

{{SEMGREP_BLOCK}}

## Open risks and next steps

- Re-run MCP tools after fixes (`semgrep_scan`, `intel_refresh`, dynamic tools only when `dynamic_allowed` is true).
- Out-of-scope items: organizational ISO controls, full SIEM, NVD enrichment (see [ROADMAP.md](../ROADMAP.md)).

## Optional PDF

If [Pandoc](https://pandoc.org/) is installed: `pandoc FINAL_SECURITY_REPORT_*.md -o report.pdf`
