#!/usr/bin/env bash
set -euo pipefail
# SPARQL: RDF query language - uses Apache Jena (arq)
# https://jena.apache.org/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install jena
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y libjena-java || {
    # Manual download
    JENA_VER="5.0.0"
    curl -fSL "https://dlcdn.apache.org/jena/binaries/apache-jena-${JENA_VER}.tar.gz" -o /tmp/jena.tar.gz
    sudo tar xzf /tmp/jena.tar.gz -C /opt/ && rm /tmp/jena.tar.gz
    sudo ln -sf /opt/apache-jena-${JENA_VER}/bin/arq /usr/local/bin/arq
  }
elif command -v pacman >/dev/null 2>&1; then
  echo "Install Apache Jena manually from https://jena.apache.org/download/" >&2
  exit 1
else
  echo "Unsupported package manager." >&2; exit 1
fi
