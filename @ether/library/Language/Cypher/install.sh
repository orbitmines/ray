#!/usr/bin/env bash
set -euo pipefail
# Cypher is Neo4j's query language. Install Neo4j or cypher-shell.
if [[ "$(uname)" == "Darwin" ]]; then
  brew install neo4j
elif command -v apt-get >/dev/null 2>&1; then
  # Add Neo4j repository
  curl -fsSL https://debian.neo4j.com/neotechnology.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/neo4j.gpg
  echo "deb [signed-by=/usr/share/keyrings/neo4j.gpg] https://debian.neo4j.com stable latest" | sudo tee /etc/apt/sources.list.d/neo4j.list
  sudo apt-get update && sudo apt-get install -y neo4j
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y neo4j || {
    echo "Install Neo4j manually from https://neo4j.com/download/" >&2; exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm neo4j || {
    echo "Install Neo4j from AUR." >&2; exit 1
  }
else
  echo "Unsupported platform. Install Neo4j manually." >&2; exit 1
fi
