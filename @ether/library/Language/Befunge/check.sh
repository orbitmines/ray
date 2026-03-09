#!/usr/bin/env bash
set -euo pipefail
command -v befungee >/dev/null 2>&1 || command -v bef >/dev/null 2>&1 || python3 -c "import befungee" 2>/dev/null
