#!/usr/bin/env bash
set -euo pipefail
# Eiffel - EiffelStudio
if [[ "$(uname)" == "Darwin" ]]; then
  echo "EiffelStudio is not in Homebrew. Download from https://www.eiffel.org/downloads" >&2
  echo "Or install via: brew install --cask eiffelstudio (if available)" >&2
  exit 1
elif command -v apt-get >/dev/null 2>&1; then
  # EiffelStudio may be available via PPA or manual download
  echo "Download EiffelStudio from https://www.eiffel.org/downloads" >&2
  echo "For Debian/Ubuntu, check: https://www.eiffel.org/doc/solutions/EiffelStudio_on_Linux" >&2
  exit 1
elif command -v dnf >/dev/null 2>&1; then
  echo "Download EiffelStudio from https://www.eiffel.org/downloads" >&2; exit 1
elif command -v pacman >/dev/null 2>&1; then
  echo "Check AUR for eiffelstudio: yay -S eiffelstudio" >&2; exit 1
else
  echo "Download EiffelStudio from https://www.eiffel.org/downloads" >&2; exit 1
fi
