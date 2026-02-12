#!/usr/bin/env bash
set -euo pipefail
exec goal clerk compile "$@"
