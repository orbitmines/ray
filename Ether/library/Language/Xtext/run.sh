#!/usr/bin/env bash
set -euo pipefail
echo "Xtext is a language development framework, not a standalone runner." >&2
echo "Use it within Eclipse IDE." >&2
cat "$1"
