#!/usr/bin/env bash
if command -v bun >/dev/null 2>&1; then
  exec bun run "$@"
else
  exec node "$@"
fi
