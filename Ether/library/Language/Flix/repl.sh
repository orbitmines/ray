#!/usr/bin/env bash
if command -v flix >/dev/null 2>&1; then
  exec flix repl
else
  exec java -jar "$HOME/.flix/flix.jar" repl
fi
