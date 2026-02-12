#!/usr/bin/env bash
set -euo pipefail
file="$1"
kotlinc "$file" -include-runtime -d /tmp/kotlin_out.jar && java -jar /tmp/kotlin_out.jar
rm -f /tmp/kotlin_out.jar
