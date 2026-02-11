#!/usr/bin/env bash
set -euo pipefail
# Gluon - statically typed, functional programming language
if command -v cargo >/dev/null 2>&1; then
  cargo install gluon_cli
else
  echo "Rust/cargo is required. Install Rust first: https://rustup.rs/" >&2; exit 1
fi
