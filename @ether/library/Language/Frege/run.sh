#!/usr/bin/env bash
set -euo pipefail
FREGE_JAR="$HOME/.frege/frege.jar"
java -cp "$FREGE_JAR" frege.compiler.Main "$1" && java -cp ".:$FREGE_JAR" "$(basename "${1%.fr}")"
