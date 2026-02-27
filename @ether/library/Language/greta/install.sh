#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing greta from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/greta-dev/greta"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/greta-dev/greta.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && Rscript -e "devtools::install('.')"
  exit 0
fi
# Install greta R package from CRAN
command -v Rscript >/dev/null 2>&1 || { echo "R is required. Install R first." >&2; exit 1; }
Rscript -e 'install.packages("greta", repos="https://cloud.r-project.org")'
