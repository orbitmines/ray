#!/usr/bin/env bash
set -euo pipefail
# Official Isabelle installation (https://isabelle.in.tum.de/installation.html)
# Isabelle is distributed as a self-contained archive.
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask isabelle
elif [[ "$(uname)" == "Linux" ]]; then
  ISABELLE_VERSION="Isabelle2024"
  curl -fsSL "https://isabelle.in.tum.de/dist/${ISABELLE_VERSION}_linux.tar.gz" -o /tmp/isabelle.tar.gz
  sudo tar -xzf /tmp/isabelle.tar.gz -C /opt/
  sudo ln -sf "/opt/${ISABELLE_VERSION}/bin/isabelle" /usr/local/bin/isabelle
  rm -f /tmp/isabelle.tar.gz
else
  echo "Unsupported platform." >&2; exit 1
fi
