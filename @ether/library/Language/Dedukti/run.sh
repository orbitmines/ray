#!/usr/bin/env bash
set -euo pipefail
if command -v dk >/dev/null 2>&1; then
  exec dk check "$1"
else
  exec dkcheck "$1"
fi
