#!/usr/bin/env bash
set -euo pipefail
# Starlark - Python-like configuration language
if command -v go >/dev/null 2>&1; then
  go install go.starlark.net/cmd/starlark@latest
else
  echo "Go is required. Install Go first: https://go.dev/dl/" >&2; exit 1
fi
