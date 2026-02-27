#!/usr/bin/env bash
set -euo pipefail
# Alloy - lightweight formal modelling language / model checker
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/AlloyTools/org.alloytools.alloy"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/AlloyTools/org.alloytools.alloy.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if [[ -f gradlew ]]; then
    ./gradlew build -x test || true
  elif command -v gradle &>/dev/null; then
    gradle build -x test || true
  fi
  exit 0
fi
# Download the Alloy jar directly
INSTALL_DIR="${ETHER_EXTERNAL_DIR:-$HOME/.local/share}/alloy"
mkdir -p "$INSTALL_DIR"
if ! command -v java &>/dev/null; then
  echo "Java is required. Install a JDK first." >&2; exit 1
fi
ALLOY_JAR="$INSTALL_DIR/alloy.jar"
if [[ ! -f "$ALLOY_JAR" ]]; then
  curl -fSL -o "$ALLOY_JAR" "https://github.com/AlloyTools/org.alloytools.alloy/releases/latest/download/org.alloytools.alloy.dist.jar" || {
    echo "Failed to download Alloy jar." >&2; exit 1
  }
fi
echo "Alloy installed at $ALLOY_JAR"
echo "Run with: java -jar $ALLOY_JAR"
