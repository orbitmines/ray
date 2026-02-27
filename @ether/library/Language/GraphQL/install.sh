#!/usr/bin/env bash
set -euo pipefail
# GraphQL is a query language specification; no standalone runtime to install.
# Install graphql-js reference implementation for validation/execution.
if command -v npm >/dev/null 2>&1; then
  npm install -g graphql graphql-language-service-cli
else
  echo "npm is required to install GraphQL tooling. Install Node.js first." >&2
  exit 1
fi
