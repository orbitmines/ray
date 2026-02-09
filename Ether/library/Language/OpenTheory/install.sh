#!/usr/bin/env bash
set -euo pipefail
echo "OpenTheory is a standard for sharing HOL theorem prover theories."
echo "The opentheory tool can be installed via the OpenTheory project."
echo "See http://www.gilith.com/opentheory/ for installation instructions."
if command -v cabal >/dev/null 2>&1; then
  cabal update && cabal install opentheory
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y opentheory || {
    echo "Package not found. Install via cabal or from source." >&2; exit 1
  }
else
  echo "Install Haskell/cabal first, then: cabal install opentheory" >&2; exit 1
fi
