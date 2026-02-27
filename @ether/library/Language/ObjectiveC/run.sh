#!/usr/bin/env bash
set -euo pipefail
INPUT="$1"; shift
OUT="$(mktemp)"
if [[ "$(uname)" == "Darwin" ]]; then
  clang -framework Foundation -o "$OUT" "$INPUT" "$@"
else
  clang $(gnustep-config --objc-flags) $(gnustep-config --objc-libs) -o "$OUT" "$INPUT" "$@"
fi
"$OUT"
rm -f "$OUT"
