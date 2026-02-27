#!/usr/bin/env bash
set -euo pipefail
if command -v befungee >/dev/null 2>&1; then
  exec befungee "$1"
elif command -v bef >/dev/null 2>&1; then
  exec bef "$1"
else
  exec python3 -m befungee "$1"
fi
