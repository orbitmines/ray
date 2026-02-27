#!/usr/bin/env bash
set -euo pipefail
# Leo-III theorem prover - https://github.com/leoprover/Leo-III
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/leoprover/Leo-III"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/leoprover/Leo-III.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v sbt >/dev/null 2>&1 || { echo "sbt (Scala Build Tool) required." >&2; exit 1; }
sbt assembly
echo "Leo-III built. Run with: java -jar $REPO_DIR/target/scala-*/Leo-III-assembly-*.jar"
