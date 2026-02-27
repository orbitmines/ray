#!/usr/bin/env bash
FREGE_JAR="$HOME/.frege/frege.jar"
exec java -cp "$FREGE_JAR" frege.repl.FregeRepl
