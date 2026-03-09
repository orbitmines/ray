#!/usr/bin/env bash
set -euo pipefail
# WGSL (WebGPU Shading Language) - shading language for WebGPU
# naga CLI can validate/translate WGSL
# https://www.w3.org/TR/WGSL/
cargo install naga-cli 2>/dev/null || {
  echo "Install Rust/Cargo first, then: cargo install naga-cli" >&2
  echo "WGSL is primarily used in browsers via the WebGPU API." >&2
  exit 1
}
