#!/usr/bin/env bash
set -euo pipefail
# Z Notation - formal specification language
# CZT (Community Z Tools) provides tooling
# https://czt.sourceforge.net/
echo "Z Notation is a formal specification language."
echo "CZT (Community Z Tools) can be downloaded from: https://czt.sourceforge.net/"
echo "Alternatively, use fuzz (Z type checker) if available."
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y fuzz 2>/dev/null || true
fi
