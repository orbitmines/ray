#!/usr/bin/env bash
set -euo pipefail
# ArnoldC - joke programming language based on Arnold Schwarzenegger quotes
# https://github.com/lhartikk/ArnoldC
if ! command -v java &>/dev/null; then
  echo "Java is required. Install a JDK first." >&2; exit 1
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/lhartikk/ArnoldC"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/lhartikk/ArnoldC.git "$REPO_DIR"
fi
cd "$REPO_DIR"
# Build with Maven or Gradle if available
if [[ -f pom.xml ]] && command -v mvn &>/dev/null; then
  mvn package -DskipTests || true
elif [[ -f build.gradle ]] && command -v gradle &>/dev/null; then
  gradle build -x test || true
elif [[ -f gradlew ]]; then
  ./gradlew build -x test || true
fi
echo "ArnoldC installed at $REPO_DIR"
