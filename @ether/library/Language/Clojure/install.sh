#!/usr/bin/env bash
set -euo pipefail
# Official install: https://clojure.org/guides/install_clojure
if [[ "$(uname)" == "Darwin" ]]; then
  brew install clojure/tools/clojure
else
  # Official method for all Linux: linux-install.sh
  # Requires: bash, curl, rlwrap, java
  curl -L -O https://github.com/clojure/brew-install/releases/latest/download/linux-install.sh
  chmod +x linux-install.sh && sudo ./linux-install.sh && rm linux-install.sh
fi
