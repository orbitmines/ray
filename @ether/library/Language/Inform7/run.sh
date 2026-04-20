#!/usr/bin/env bash
set -euo pipefail
if command -v inform7 >/dev/null 2>&1; then
  exec inform7 "$@"
elif command -v ni >/dev/null 2>&1; then
  exec ni "$@"
else
  echo "Neither inform7 nor ni found in PATH." >&2; exit 1
fi
