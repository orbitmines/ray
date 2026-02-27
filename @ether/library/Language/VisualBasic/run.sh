#!/usr/bin/env bash
set -euo pipefail
file="$1"
if [[ -d "$file" ]]; then
  cd "$file" && dotnet run
else
  TMPDIR=$(mktemp -d)
  dotnet new console --language VB -o "$TMPDIR" --force >/dev/null
  cp "$file" "$TMPDIR/Program.vb"
  cd "$TMPDIR" && dotnet run
  rm -rf "$TMPDIR"
fi
