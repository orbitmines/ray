#!/usr/bin/env bash
if command -v enso >/dev/null 2>&1; then
  exec enso repl
elif [[ -x /opt/enso/bin/enso ]]; then
  exec /opt/enso/bin/enso repl
else
  echo "Enso not found." >&2; exit 1
fi
