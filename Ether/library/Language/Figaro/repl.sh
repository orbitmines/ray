#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/charles-river-analytics/figaro"
cd "$REPO_DIR" && exec sbt console
