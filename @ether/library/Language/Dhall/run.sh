#!/usr/bin/env bash
set -euo pipefail
exec dhall <<< "$(cat "$1")"
