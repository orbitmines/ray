#!/usr/bin/env bash
if command -v factor-lang >/dev/null 2>&1; then
  exec factor-lang
elif [[ -x /opt/factor/factor ]]; then
  exec /opt/factor/factor
else
  echo "Factor not found." >&2; exit 1
fi
