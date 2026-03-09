#!/usr/bin/env bash
set -euo pipefail
# Install dimple - https://github.com/analog-garage/dimple
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/analog-garage/dimple"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/analog-garage/dimple.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v gradle >/dev/null 2>&1; then
  gradle build -x test
elif [[ -f ./gradlew ]]; then
  ./gradlew build -x test
else
  echo "Gradle is required to build dimple." >&2; exit 1
fi
