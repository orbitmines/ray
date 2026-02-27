#!/usr/bin/env bash
if command -v lua >/dev/null 2>&1; then
  exec lua
else
  exec lua5.4
fi
