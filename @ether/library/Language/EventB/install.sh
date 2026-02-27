#!/usr/bin/env bash
set -euo pipefail
# Install Event-B (Rodin platform) - https://www.event-b.org/
# Rodin is an Eclipse-based IDE for Event-B
echo "Event-B uses the Rodin platform (Eclipse-based IDE)."
echo "Download from: https://wiki.event-b.org/index.php/Rodin_Platform_Releases"
echo "Rodin requires a manual download of the Eclipse-based IDE."
if [[ "$(uname)" == "Linux" ]]; then
  ARCH=$(uname -m)
  echo "Visit https://sourceforge.net/projects/rodin-b-sharp/ to download Rodin for Linux ($ARCH)."
fi
