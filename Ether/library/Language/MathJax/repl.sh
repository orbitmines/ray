#!/usr/bin/env bash
exec node -e "const MathJax = require('mathjax'); const repl = require('repl'); repl.start('mathjax> ')"
