#!/usr/bin/env bash
set -euo pipefail
# SpinalHDL: Scala-based HDL - https://spinalhdl.github.io/
# Requires Java + sbt (Scala build tool)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install sbt
elif command -v apt-get >/dev/null 2>&1; then
  echo "deb https://repo.scala-sbt.org/scalasbt/debian all main" | sudo tee /etc/apt/sources.list.d/sbt.list
  curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | sudo apt-key add -
  sudo apt-get update && sudo apt-get install -y sbt
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y sbt || {
    echo "Install sbt from https://www.scala-sbt.org/download.html" >&2; exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm sbt
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/SpinalHDL/SpinalHDL"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/SpinalHDL/SpinalHDL.git "$REPO_DIR"
fi
cd "$REPO_DIR" && sbt publishLocal
