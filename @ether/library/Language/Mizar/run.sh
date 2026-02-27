#!/usr/bin/env bash
set -euo pipefail
if command -v mizf >/dev/null 2>&1; then
  exec mizf "$1"
else
  exec verifier "$1"
fi
