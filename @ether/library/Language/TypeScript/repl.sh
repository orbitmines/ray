#!/usr/bin/env bash
if command -v bun >/dev/null 2>&1; then
  exec bun repl
elif command -v ts-node >/dev/null 2>&1; then
  exec ts-node
else
  exec npx ts-node
fi
