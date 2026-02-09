#!/usr/bin/env bash
set -euo pipefail
file="$1"
if [[ -d "$file" ]]; then
  cd "$file" && dotnet run
else
  dotnet script "$file" 2>/dev/null || dotnet-script "$file" 2>/dev/null || { echo "Install dotnet-script for single file execution" >&2; exit 1; }
fi
