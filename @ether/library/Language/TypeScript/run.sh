#!/usr/bin/env bash
set -euo pipefail
file="$1"
if command -v bun >/dev/null 2>&1; then
  exec bun run "$file"
elif command -v ts-node >/dev/null 2>&1; then
  exec ts-node "$file"
elif command -v npx >/dev/null 2>&1; then
  exec npx ts-node "$file"
else
  tsc "$file" --outDir /tmp && node "/tmp/$(basename "${file%.ts}.js")"
fi
