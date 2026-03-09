#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
OUT="${FILE%.adb}"
gnatmake -o "$OUT" "$FILE"
exec "$OUT"
