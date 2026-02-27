#!/usr/bin/env bash
set -euo pipefail
if command -v npm >/dev/null 2>&1; then
  npm install -g typescript ts-node
elif command -v bun >/dev/null 2>&1; then
  bun install -g typescript
else
  echo "npm or bun required. Install Node.js first." >&2; exit 1
fi
