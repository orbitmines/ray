#!/usr/bin/env bash
command -v mps >/dev/null 2>&1 || [[ -d "/opt/MPS" ]] || [[ -d "$HOME/.local/share/JetBrains/MPS" ]]
