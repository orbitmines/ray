#!/usr/bin/env bash
command -v racket >/dev/null 2>&1 && racket -e '(require gamble)' 2>/dev/null
