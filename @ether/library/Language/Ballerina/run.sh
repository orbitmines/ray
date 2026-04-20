#!/usr/bin/env bash
set -euo pipefail
if command -v bal >/dev/null 2>&1; then
  exec bal run "$1"
elif command -v ballerina >/dev/null 2>&1; then
  exec ballerina run "$1"
else
  echo "No Ballerina installation found." >&2; exit 1
fi
