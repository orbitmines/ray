#!/usr/bin/env bash
set -euo pipefail
command -v racket >/dev/null 2>&1 && racket -e '(require rosette)' >/dev/null 2>&1
