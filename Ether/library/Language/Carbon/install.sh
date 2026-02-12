#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/carbon-language/carbon-lang"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/carbon-language/carbon-lang.git "$REPO_DIR"
fi
# Carbon requires Bazel and Clang/LLVM
if ! command -v bazel >/dev/null 2>&1; then
  echo "Bazel is required. Install it first: https://bazel.build/install" >&2
  exit 1
fi
cd "$REPO_DIR"
bazel build //explorer
