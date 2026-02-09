#!/usr/bin/env bash
set -euo pipefail
fbc "$1" -x "${1%.bas}" && exec "./${1%.bas}"
