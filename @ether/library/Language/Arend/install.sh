#!/usr/bin/env bash
set -euo pipefail
# Arend - proof assistant based on HoTT - https://arend-lang.github.io/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/JetBrains/Arend"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/JetBrains/Arend.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if [[ -f gradlew ]]; then
    ./gradlew build -x test
  elif command -v gradle &>/dev/null; then
    gradle build -x test
  fi
  exit 0
fi
# Download the Arend jar
INSTALL_DIR="${ETHER_EXTERNAL_DIR:-$HOME/.local/share}/arend"
mkdir -p "$INSTALL_DIR"
if ! command -v java &>/dev/null; then
  echo "Java is required. Install a JDK first." >&2; exit 1
fi
AREND_JAR="$INSTALL_DIR/Arend.jar"
if [[ ! -f "$AREND_JAR" ]]; then
  curl -fSL -o "$AREND_JAR" "https://github.com/JetBrains/Arend/releases/latest/download/Arend.jar" || {
    echo "Failed to download Arend jar." >&2; exit 1
  }
fi
echo "Arend installed at $AREND_JAR"
