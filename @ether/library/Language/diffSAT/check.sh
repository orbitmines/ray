#!/usr/bin/env bash
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/MatthiasNickworX/diffSAT"
ls "$REPO_DIR"/target/scala-*/diffSAT*.jar >/dev/null 2>&1 || command -v diffSAT >/dev/null 2>&1
