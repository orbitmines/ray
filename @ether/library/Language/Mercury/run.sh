#!/usr/bin/env bash
set -euo pipefail
file="$1"
base="$(basename "$file" .m)"
dir="$(dirname "$file")"
cd "$dir" && mmc --make "$base" && ./"$base"
