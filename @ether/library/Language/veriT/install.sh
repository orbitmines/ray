#!/usr/bin/env bash
set -euo pipefail
# veriT SMT solver - https://verit.loria.fr/
# Must be built from source
curl -fsSL "https://verit.loria.fr/distrib/veriT-stable2016.tar.gz" -o /tmp/veriT.tar.gz
mkdir -p /tmp/veriT-build
tar -xzf /tmp/veriT.tar.gz -C /tmp/veriT-build --strip-components=1
cd /tmp/veriT-build
autoconf && ./configure && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
mkdir -p "$HOME/.local/bin"
cp veriT "$HOME/.local/bin/"
rm -rf /tmp/veriT-build /tmp/veriT.tar.gz
