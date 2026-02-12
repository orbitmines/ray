#!/usr/bin/env bash
set -euo pipefail
# AQASM - Atos Quantum Assembly Language (part of myQLM)
pip3 install myqlm 2>/dev/null || pip install myqlm 2>/dev/null || {
  echo "Failed to install myQLM. Ensure pip/pip3 is available." >&2; exit 1
}
