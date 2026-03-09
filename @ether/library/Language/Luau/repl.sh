#!/usr/bin/env bash
if command -v luau >/dev/null 2>&1; then
  exec luau
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/luau-lang/luau"
  exec "$REPO_DIR/build/luau"
fi
