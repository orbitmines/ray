#!/usr/bin/env bash
set -euo pipefail
# Apache Velocity - Java-based template engine
# https://velocity.apache.org/
# Requires Java and is used as a library, not a standalone tool
command -v java >/dev/null 2>&1 || {
  echo "Java is required for Apache Velocity." >&2
  exit 1
}
VELOCITY_VERSION="2.3"
mkdir -p "$HOME/.local/lib/velocity"
curl -fsSL "https://dlcdn.apache.org/velocity/engine/${VELOCITY_VERSION}/velocity-engine-core-${VELOCITY_VERSION}.jar" \
  -o "$HOME/.local/lib/velocity/velocity-engine-core-${VELOCITY_VERSION}.jar" || {
  echo "Download Velocity from: https://velocity.apache.org/download.cgi" >&2
  exit 1
}
