#!/usr/bin/env bash
set -euo pipefail
if command -v mit-scheme >/dev/null 2>&1; then
  exec mit-scheme --quiet --load "$1"
elif command -v scheme >/dev/null 2>&1; then
  exec scheme --script "$1"
elif command -v guile >/dev/null 2>&1; then
  exec guile "$1"
fi
