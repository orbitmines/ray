#!/usr/bin/env bash
set -euo pipefail
# XPath expressions are used against XML documents with xmllint
exec xmllint --xpath "$(cat "$1")" /dev/stdin
