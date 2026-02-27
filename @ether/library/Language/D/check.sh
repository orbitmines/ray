#!/usr/bin/env bash
set -euo pipefail
command -v dmd >/dev/null 2>&1 || command -v ldc2 >/dev/null 2>&1
