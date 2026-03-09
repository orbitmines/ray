#!/usr/bin/env bash
set -euo pipefail
file="$1"
if [[ -d "$file" ]]; then
  cd "$file"
  if [[ -f "pom.xml" ]]; then mvn exec:java
  elif [[ -f "build.gradle" ]]; then gradle run
  else echo "No build system found" >&2; exit 1; fi
else
  javac "$file" && java "${file%.java}"
fi
