#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="R"
REGISTRIES=(
  "CRAN: https://cran.r-project.org"
  "Bioconductor: https://bioconductor.org"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
  echo ""
  echo "Registries:"
  for r in "${REGISTRIES[@]}"; do echo "  $r"; done
  echo ""
  echo "Usage: $0 {search|info|install} <package>"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  search)
    [[ $# -eq 0 ]] && { echo "Usage: $0 search <query>"; exit 1; }
    echo "Visit: https://cran.r-project.org/web/packages/available_packages_by_name.html"
    echo "Search: https://www.r-pkg.org/search?q=$1"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v Rscript &>/dev/null; then
      Rscript -e "packageDescription(\"$1\")" 2>/dev/null || echo "Visit: https://cran.r-project.org/package=$1"
    else
      echo "Visit: https://cran.r-project.org/package=$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    Rscript -e "install.packages(\"$1\", repos='https://cloud.r-project.org')"
    ;;
  *)
    show_usage
    ;;
esac
