#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/HOL-Theorem-Prover/HOL"
command -v hol >/dev/null 2>&1 || [[ -x "$REPO_DIR/bin/hol" ]]
