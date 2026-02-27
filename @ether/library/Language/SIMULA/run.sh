#!/usr/bin/env bash
set -euo pipefail
file="$1"
cim "$file" -o /tmp/simula_out && /tmp/simula_out
