#!/usr/bin/env bash
set -euo pipefail
exec tree-sitter parse "$@"
