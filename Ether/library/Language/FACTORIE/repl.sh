#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/factorie/factorie"
exec scala -cp "$REPO_DIR/target/classes:$REPO_DIR/target/dependency/*"
