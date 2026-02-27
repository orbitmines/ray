#!/usr/bin/env bash
set -euo pipefail
# HQ9+ is a trivial esoteric language. We provide a minimal interpreter.
# See: https://esolangs.org/wiki/HQ9%2B
HQ9_BIN="$HOME/.local/bin/hq9plus"
mkdir -p "$HOME/.local/bin"
cat > "$HQ9_BIN" << 'INTERP'
#!/usr/bin/env python3
import sys
if len(sys.argv) < 2:
    print("Usage: hq9plus <file>", file=sys.stderr); sys.exit(1)
with open(sys.argv[1]) as f:
    code = f.read()
acc = 0
for c in code:
    if c == 'H':
        print("Hello, World!")
    elif c == 'Q':
        print(code, end='')
    elif c == '9':
        for i in range(99, 0, -1):
            b = "bottle" if i == 1 else "bottles"
            b2 = "bottle" if i - 1 == 1 else "bottles"
            print(f"{i} {b} of beer on the wall, {i} {b} of beer.")
            if i > 1:
                print(f"Take one down and pass it around, {i-1} {b2} of beer on the wall.\n")
            else:
                print("Go to the store and buy some more, 99 bottles of beer on the wall.\n")
    elif c == '+':
        acc += 1
INTERP
chmod +x "$HQ9_BIN"
echo "HQ9+ interpreter installed to $HQ9_BIN"
