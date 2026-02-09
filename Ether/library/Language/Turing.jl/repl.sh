#!/usr/bin/env bash
exec julia -e 'using Turing; import REPL; REPL.run_repl(REPL.LineEditREPL(REPL.Terminals.TTYTerminal("", stdin, stdout, stderr)))'
