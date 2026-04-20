#!/usr/bin/env bash
if command -v shen >/dev/null 2>&1; then
  exec shen
else
  exec shen-cl
fi
