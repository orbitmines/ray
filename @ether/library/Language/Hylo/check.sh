#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/hylo-lang/hylo"
command -v hylo >/dev/null 2>&1 || [[ -x "$REPO_DIR/.build/release/hc" ]]
