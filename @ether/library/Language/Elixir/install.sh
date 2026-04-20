#!/usr/bin/env bash
set -euo pipefail
# Official install: https://elixir-lang.org/install.html
if [[ "$(uname)" == "Darwin" ]]; then
  brew install elixir
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm elixir
elif command -v apt-get >/dev/null 2>&1; then
  # Default apt packages are severely outdated; use Erlang Solutions repo
  if [[ ! -f /etc/apt/sources.list.d/erlang-solutions.list ]]; then
    wget -q https://packages.erlang-solutions.com/erlang-solutions_2.0_all.deb -O /tmp/erlang-solutions.deb
    sudo dpkg -i /tmp/erlang-solutions.deb
    rm -f /tmp/erlang-solutions.deb
    sudo apt-get update
  fi
  sudo apt-get install -y elixir
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y elixir
else
  echo "Unsupported package manager." >&2; exit 1
fi
