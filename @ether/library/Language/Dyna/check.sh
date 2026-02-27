#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/nwf/dyna"
[[ -d "$REPO_DIR" ]] || command -v dyna >/dev/null 2>&1
