#!/usr/bin/env bash
set -euo pipefail
if command -v patscc >/dev/null 2>&1; then
  patscc -o "${1%.dats}" "$1" && exec "./${1%.dats}"
elif command -v atscc >/dev/null 2>&1; then
  atscc -o "${1%.dats}" "$1" && exec "./${1%.dats}"
else
  echo "No ATS compiler found." >&2; exit 1
fi
