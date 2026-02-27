#!/usr/bin/env bash
set -euo pipefail
if [[ -d "$1" ]]; then
  cd "$1" && flutter run
else
  exec dart run "$1"
fi
