#!/usr/bin/env bash
set -euo pipefail
# Spade: HDL language - https://spade-lang.org/
# Install via cargo (Rust-based)
if command -v cargo >/dev/null 2>&1; then
  cargo install --git https://gitlab.com/spade-lang/spade swim
else
  echo "Requires Rust/cargo. Install Rust first." >&2
  exit 1
fi
