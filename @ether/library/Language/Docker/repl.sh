#!/usr/bin/env bash
set -euo pipefail
if command -v docker >/dev/null 2>&1; then
  echo "Docker interactive shell:"
  echo "  docker run -it ubuntu bash"
  echo "  docker run -it alpine sh"
  echo "  docker run -it python python3"
  echo ""
  echo "Or specify an image: docker run -it <image> <shell>"
  exec docker run -it ubuntu bash
else
  echo "Docker is not installed."
  exit 1
fi
