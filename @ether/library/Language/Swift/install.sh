#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  # Official swiftly installer (https://www.swift.org/install/macos/)
  curl -O https://download.swift.org/swiftly/darwin/swiftly.pkg
  installer -pkg swiftly.pkg -target CurrentUserHomeDirectory
  ~/.swiftly/bin/swiftly init --quiet-shell-followup
  . "${SWIFTLY_HOME_DIR:-$HOME/.swiftly}/env.sh"
  hash -r
  rm -f swiftly.pkg
else
  # Official swiftly installer (https://www.swift.org/install/linux/)
  curl -O "https://download.swift.org/swiftly/linux/swiftly-$(uname -m).tar.gz"
  tar zxf "swiftly-$(uname -m).tar.gz"
  ./swiftly init --quiet-shell-followup
  . "${SWIFTLY_HOME_DIR:-$HOME/.local/share/swiftly}/env.sh"
  hash -r
  rm -f "swiftly-$(uname -m).tar.gz" swiftly
fi
