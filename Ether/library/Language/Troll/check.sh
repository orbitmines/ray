#!/usr/bin/env bash
command -v troll >/dev/null 2>&1 || {
  TROLL_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/troll"
  [[ -d "$TROLL_DIR" ]]
}
