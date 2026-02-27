#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/UoYCS-plasma/GP2"
[[ -d "$REPO_DIR" ]] && command -v gp2 >/dev/null 2>&1 || [[ -x "$REPO_DIR/bin/gp2" ]]
