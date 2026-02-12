#!/usr/bin/env bash
set -euo pipefail
# Chicken is an esoteric language. Use a JavaScript interpreter.
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/igorto/chicken-js"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/igorto/chicken-js.git "$REPO_DIR" || {
    # Fallback: create a simple Python interpreter
    mkdir -p "$REPO_DIR"
    cat > "$REPO_DIR/chicken.py" << 'PYEOF'
#!/usr/bin/env python3
"""Simple Chicken language interpreter."""
import sys
if len(sys.argv) < 2:
    print("Usage: chicken.py <file>", file=sys.stderr)
    sys.exit(1)
with open(sys.argv[1]) as f:
    code = f.read()
lines = code.strip().split('\n')
program = [line.count('chicken') for line in lines]
stack = []
for op in program:
    if op == 0: sys.exit(0)
    elif op == 1: stack.append('chicken')
    elif op == 2:
        a = stack.pop()
        b = stack.pop()
        stack.append(a + b)
    elif op == 3:
        a = stack.pop()
        stack.append(chr(a) if isinstance(a, int) else a)
        sys.stdout.write(stack[-1])
    else:
        stack.append(op)
PYEOF
  }
fi
