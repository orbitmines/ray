#!/usr/bin/env bash
set -euo pipefail
# Whenever - esoteric language where execution order is random
# https://esolangs.org/wiki/Whenever
# A Python implementation exists
pip install whenever-lang 2>/dev/null || {
  echo "No standard package. See https://esolangs.org/wiki/Whenever for interpreters." >&2
  exit 1
}
