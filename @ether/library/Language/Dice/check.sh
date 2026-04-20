#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/SHoltzen/dice"
[[ -x "$REPO_DIR/dice" ]] || command -v dice >/dev/null 2>&1
