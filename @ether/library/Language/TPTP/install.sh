#!/usr/bin/env bash
set -euo pipefail
# TPTP: problem format for automated theorem provers - https://www.tptp.org/
# TPTP is a file format; install E theorem prover as a reference tool
if [[ "$(uname)" == "Darwin" ]]; then
  brew install eprover
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y eprover
elif command -v pacman >/dev/null 2>&1; then
  echo "Install eprover from AUR: yay -S eprover" >&2
else
  echo "Download E prover from https://wwwlehre.dhbw-stuttgart.de/~sschulz/E/E.html" >&2
fi
echo "TPTP is a problem format. Install a theorem prover (E, Vampire, etc.) to process .p files."
