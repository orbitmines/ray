#!/usr/bin/env bash
command -v fstar.exe >/dev/null 2>&1 || command -v fstar >/dev/null 2>&1 || [[ -x /opt/fstar/bin/fstar.exe ]]
