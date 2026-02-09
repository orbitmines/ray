#!/usr/bin/env bash
set -euo pipefail
exec spago run --main "$1"
