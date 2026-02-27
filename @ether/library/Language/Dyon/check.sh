#!/usr/bin/env bash
command -v dyon_interactive >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/PistonDevelopers/dyon"
  [[ -x "$REPO_DIR/target/release/dyon_interactive" ]]
}
