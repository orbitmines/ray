#!/usr/bin/env bash
set -euo pipefail
# ALF - Another Logical Framework (historical proof assistant)
# ALF is a historical system; no modern package manager installation exists.
# Attempting from-source build from any available repository.
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ALF/alf"
echo "ALF is a historical proof assistant from Chalmers University." >&2
echo "No modern package or maintained source repository is available." >&2
echo "See: https://en.wikipedia.org/wiki/ALF_(proof_assistant)" >&2
exit 1
