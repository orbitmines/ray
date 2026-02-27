#!/usr/bin/env bash
set -euo pipefail
command -v overture >/dev/null 2>&1 || [[ -f "$HOME/.local/lib/overture/overture.jar" ]]
