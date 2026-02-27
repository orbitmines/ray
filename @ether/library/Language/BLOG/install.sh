#!/usr/bin/env bash
set -euo pipefail
# BLOG - Bayesian Logic (Java-based probabilistic programming)
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/BayesianLogic/blog"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/BayesianLogic/blog.git "$REPO_DIR"
fi
cd "$REPO_DIR"
if command -v java >/dev/null 2>&1; then
  if [[ -f build.xml ]]; then
    ant build || true
  elif [[ -f pom.xml ]]; then
    mvn package -DskipTests || true
  elif [[ -f gradlew ]]; then
    ./gradlew build || true
  fi
  chmod +x dblog 2>/dev/null || chmod +x blog 2>/dev/null || true
else
  echo "Java is required to build BLOG." >&2; exit 1
fi
