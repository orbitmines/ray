#!/usr/bin/env bash
set -euo pipefail
# TLA+: formal specification language - https://lamport.azurewebsites.net/tla/tla.html
# Install TLA+ tools (TLC model checker, requires Java)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install tlaplus
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y default-jre
  mkdir -p "$HOME/.local/lib/tla"
  curl -fSL "https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar" -o "$HOME/.local/lib/tla/tla2tools.jar"
  mkdir -p "$HOME/.local/bin"
  cat > "$HOME/.local/bin/tlc" << 'EOF'
#!/usr/bin/env bash
exec java -cp "$HOME/.local/lib/tla/tla2tools.jar" tlc2.TLC "$@"
EOF
  chmod +x "$HOME/.local/bin/tlc"
elif command -v pacman >/dev/null 2>&1; then
  echo "Install tlaplus from AUR: yay -S tlaplus" >&2
  exit 1
else
  echo "Download from https://github.com/tlaplus/tlaplus/releases" >&2; exit 1
fi
