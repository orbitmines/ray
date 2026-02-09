#!/usr/bin/env bash
set -euo pipefail
command -v p >/dev/null 2>&1 || dotnet tool list -g 2>/dev/null | grep -qi "^p "
