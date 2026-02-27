#!/usr/bin/env bash
if command -v bun >/dev/null 2>&1; then
  exec bun repl
else
  exec node
fi
