#!/usr/bin/env bash
set -euo pipefail
command -v node >/dev/null 2>&1 && node -e "require('@cycle/run')" 2>/dev/null
