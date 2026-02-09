#!/usr/bin/env bash
set -euo pipefail
CLIENT="octez-client"
command -v "$CLIENT" >/dev/null 2>&1 || CLIENT="tezos-client"
exec "$CLIENT" typecheck script "$1"
