#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/gitlab.com/korovin/iprover"
command -v iprover >/dev/null 2>&1 || [[ -x "$REPO_DIR/iproveropt" ]]
