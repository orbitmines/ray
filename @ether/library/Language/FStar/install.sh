#!/usr/bin/env bash
set -euo pipefail
# Install F* - https://github.com/FStarLang/FStar
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/FStarLang/FStar"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/FStarLang/FStar.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make -j"$(nproc)"
  exit 0
fi
# Install via opam
if command -v opam >/dev/null 2>&1; then
  eval "$(opam env)" || true
  opam install -y fstar
else
  # Download binary release
  OS=$(uname -s)
  if [[ "$OS" == "Linux" ]]; then
    PLATFORM="Linux"
  elif [[ "$OS" == "Darwin" ]]; then
    PLATFORM="macOS"
  else
    echo "Unsupported OS. Use FROM_SOURCE=true or opam." >&2; exit 1
  fi
  VERSION=$(curl -sSL https://api.github.com/repos/FStarLang/FStar/releases/latest | grep tag_name | cut -d'"' -f4)
  curl -fsSL "https://github.com/FStarLang/FStar/releases/download/${VERSION}/fstar_${VERSION#v}_${PLATFORM}_x86_64.tar.gz" -o /tmp/fstar.tar.gz
  sudo mkdir -p /opt/fstar && sudo tar -C /opt/fstar --strip-components=1 -xzf /tmp/fstar.tar.gz
  rm -f /tmp/fstar.tar.gz
  sudo ln -sf /opt/fstar/bin/fstar.exe /usr/local/bin/fstar
fi
