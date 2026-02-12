#!/usr/bin/env bash
set -euo pipefail

# Install the ether/ray CLI tool
# Sets up PATH and shell completions

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ETHER_BIN="$SCRIPT_DIR/ether"

echo "=== Installing ether CLI ==="

# Verify the ether script exists
if [[ ! -f "$ETHER_BIN" ]]; then
  echo "Error: ether script not found at $ETHER_BIN" >&2
  exit 1
fi

# Ensure executable
chmod +x "$ETHER_BIN"

# Create runtime directories
mkdir -p "$SCRIPT_DIR/.ether/external"
mkdir -p "$SCRIPT_DIR/.ether/cache"

# Add to PATH via shell profile
add_to_path() {
  local shell_rc="$1"
  local path_line="export PATH=\"$SCRIPT_DIR:\$PATH\""
  local completion_line="[[ -f \"$SCRIPT_DIR/completions/ether.bash\" ]] && source \"$SCRIPT_DIR/completions/ether.bash\""

  if [[ -f "$shell_rc" ]]; then
    # Add PATH if not already present (check for exact export line)
    if ! grep -qxF "$path_line" "$shell_rc" 2>/dev/null; then
      echo "" >> "$shell_rc"
      echo "# ether/ray CLI" >> "$shell_rc"
      echo "$path_line" >> "$shell_rc"
      echo "Added $SCRIPT_DIR to PATH in $shell_rc"
    else
      echo "PATH already configured in $shell_rc"
    fi

    # Add bash completion if it's a bash config
    if [[ "$shell_rc" == *"bashrc"* || "$shell_rc" == *"bash_profile"* ]]; then
      if ! grep -qxF "$completion_line" "$shell_rc" 2>/dev/null; then
        echo "$completion_line" >> "$shell_rc"
        echo "Added tab completion to $shell_rc"
      else
        echo "Tab completion already configured in $shell_rc"
      fi
    fi
  fi
}

# Detect shell and configure
if [[ -n "${BASH_VERSION:-}" ]] || [[ "$SHELL" == *bash* ]]; then
  if [[ "$(uname)" == "Darwin" ]]; then
    add_to_path "$HOME/.bash_profile"
  else
    add_to_path "$HOME/.bashrc"
  fi
fi

if [[ "$SHELL" == *zsh* ]] || [[ -f "$HOME/.zshrc" ]]; then
  add_to_path "$HOME/.zshrc"
fi

# Parse the Index.ray to build initial cache
echo "Building Index.ray cache..."
"$ETHER_BIN" Language list >/dev/null 2>&1 && echo "Cache built successfully." || echo "Warning: Cache build had issues (this is OK on first run)."

echo ""
echo "=== Installation complete ==="
echo ""
echo "Restart your shell or run:"
echo "  export PATH=\"$SCRIPT_DIR:\$PATH\""
echo "  source $SCRIPT_DIR/completions/ether.bash"
echo ""
echo "Then try:"
echo "  ether Language list"
echo "  ether Language.Python install"
echo "  ray Language.Python"
