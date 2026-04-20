#!/usr/bin/env bash
set -euo pipefail
command -v fuzz >/dev/null 2>&1 || command -v czt >/dev/null 2>&1
