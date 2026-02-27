#!/usr/bin/env bash
command -v leo >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/leoprover/Leo-III"
  ls "$REPO_DIR"/target/scala-*/Leo-III-assembly-*.jar >/dev/null 2>&1
}
