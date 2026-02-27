#!/usr/bin/env bash
set -euo pipefail
# Ballerina - cloud-native integration language
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ballerina-platform/ballerina-lang"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ballerina-platform/ballerina-lang.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./gradlew build -x test
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install bal
elif command -v apt-get >/dev/null 2>&1; then
  # Use official installer
  curl -sSL https://dist.ballerina.io/downloads/latest/ballerina-linux-installer-x64.deb -o /tmp/ballerina.deb
  sudo dpkg -i /tmp/ballerina.deb && rm /tmp/ballerina.deb
elif command -v dnf >/dev/null 2>&1; then
  curl -sSL https://dist.ballerina.io/downloads/latest/ballerina-linux-installer-x64.rpm -o /tmp/ballerina.rpm
  sudo dnf install -y /tmp/ballerina.rpm && rm /tmp/ballerina.rpm
else
  echo "Download Ballerina from https://ballerina.io/downloads/" >&2; exit 1
fi
