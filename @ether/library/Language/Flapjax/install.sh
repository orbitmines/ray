#!/usr/bin/env bash
set -euo pipefail
# Install Flapjax - https://www.flapjax-lang.org/
# Flapjax is a JavaScript library/compiler for FRP
npm install flapjax 2>/dev/null || {
  echo "Flapjax can be used via the online compiler at https://www.flapjax-lang.org/"
  echo "Or download the library from the website."
}
