#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
shift
valac "$FILE" -o /tmp/vala_out && /tmp/vala_out "$@"
