#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Infer.NET from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/dotnet/infer"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/dotnet/infer.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && dotnet build -c Release
  exit 0
fi
# Infer.NET is a .NET library; install via NuGet/dotnet
command -v dotnet >/dev/null 2>&1 || { echo ".NET SDK is required. Install it first." >&2; exit 1; }
echo "Add Infer.NET to your project: dotnet add package Microsoft.ML.Probabilistic"
dotnet new console -o /tmp/infernet-check 2>/dev/null || true
cd /tmp/infernet-check && dotnet add package Microsoft.ML.Probabilistic && dotnet add package Microsoft.ML.Probabilistic.Compiler
