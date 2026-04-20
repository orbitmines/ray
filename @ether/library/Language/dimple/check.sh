#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/analog-garage/dimple"
[[ -d "$REPO_DIR/build" ]] || command -v dimple >/dev/null 2>&1
