#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/demo"
cd "$ROOT/demo"

if [[ ! -d cursor-webinar-sec ]]; then
  git clone https://github.com/mascarock/cursor-webinar-sec.git
else
  echo "demo/cursor-webinar-sec already exists"
fi

if [[ ! -d damn-vulnerable-llm-agent ]]; then
  git clone https://github.com/ReversecLabs/damn-vulnerable-llm-agent.git
else
  echo "demo/damn-vulnerable-llm-agent already exists"
fi

echo "Done. You can run: docker compose up -d webapp-target"
echo "Cross-platform (macOS / Windows / Linux): node scripts/clone-demo-targets.mjs"
