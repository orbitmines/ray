#!/usr/bin/env bash
set -euo pipefail
# Lustre - synchronous dataflow programming language
# https://www-verimag.imag.fr/The-Lustre-Programming-Language-and
# The reference compiler (lustre-v6/lv6) is available via opam or academic distribution.
if command -v opam >/dev/null 2>&1; then
  opam install lv6 -y 2>/dev/null || {
    echo "lv6 not available in current opam repos."
    echo "See: https://www-verimag.imag.fr/The-Lustre-Programming-Language-and"
    exit 1
  }
else
  echo "Lustre compiler requires opam or manual installation."
  echo "See: https://www-verimag.imag.fr/The-Lustre-Programming-Language-and"
  exit 1
fi
