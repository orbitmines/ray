#!/usr/bin/env bash
python3 -c "import fish" 2>/dev/null || command -v fish-lang >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/TuxSH/fish-jit"
  [[ -d "$REPO_DIR" ]]
}
