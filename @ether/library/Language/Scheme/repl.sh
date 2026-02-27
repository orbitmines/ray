#!/usr/bin/env bash
set -euo pipefail
if command -v mit-scheme >/dev/null 2>&1; then
  exec mit-scheme
elif command -v scheme >/dev/null 2>&1; then
  exec scheme
elif command -v guile >/dev/null 2>&1; then
  exec guile
fi
