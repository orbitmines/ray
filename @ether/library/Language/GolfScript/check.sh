#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/rkoeninger/GolfScript"
[[ -f "$REPO_DIR/golfscript.rb" ]] && command -v ruby >/dev/null 2>&1
