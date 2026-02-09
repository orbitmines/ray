#!/usr/bin/env bash
set -euo pipefail
# Chisel is a Scala library. Install sbt and use it as a dependency.
if [[ "$(uname)" == "Darwin" ]]; then
  brew install sbt
elif command -v apt-get >/dev/null 2>&1; then
  echo "deb https://repo.scala-sbt.org/scalasbt/debian all main" | sudo tee /etc/apt/sources.list.d/sbt.list
  curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | sudo apt-key add -
  sudo apt-get update && sudo apt-get install -y sbt
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y sbt || {
    echo "Install sbt manually from https://www.scala-sbt.org/" >&2; exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm sbt
else
  echo "Install sbt manually from https://www.scala-sbt.org/" >&2; exit 1
fi
