#!/usr/bin/env bash
set -euo pipefail
# Official method: Coursier (cs setup) - https://www.scala-lang.org/download/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install coursier/formulas/coursier && cs setup -y
else
  ARCH=$(uname -m)
  if [[ "$ARCH" == "aarch64" ]]; then
    curl -fL https://github.com/coursier/coursier/releases/latest/download/cs-aarch64-pc-linux.gz | gzip -d > /tmp/cs
  else
    curl -fL https://github.com/coursier/coursier/releases/latest/download/cs-x86_64-pc-linux.gz | gzip -d > /tmp/cs
  fi
  chmod +x /tmp/cs && /tmp/cs setup -y && rm -f /tmp/cs
fi
