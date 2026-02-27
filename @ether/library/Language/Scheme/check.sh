#!/usr/bin/env bash
set -euo pipefail
command -v mit-scheme >/dev/null 2>&1 || command -v scheme >/dev/null 2>&1 || command -v guile >/dev/null 2>&1
