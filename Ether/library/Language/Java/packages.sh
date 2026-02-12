#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://search.maven.org"

usage() {
  echo "Java Package Registry:"
  echo "  $REGISTRY"
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  local q="$1"
  echo "https://search.maven.org/search?q=$q"
}

cmd_info() {
  local pkg="$1"
  echo "https://search.maven.org/artifact/$pkg"
}

cmd_install() {
  local pkg="$1"
  echo "Add to your project:"
  echo
  echo "  Maven (pom.xml):"
  echo "    <dependency>"
  echo "      <groupId>GROUP_ID</groupId>"
  echo "      <artifactId>$pkg</artifactId>"
  echo "      <version>VERSION</version>"
  echo "    </dependency>"
  echo
  echo "  Gradle (build.gradle):"
  echo "    implementation 'GROUP_ID:$pkg:VERSION'"
  echo
  echo "  Find coordinates: https://search.maven.org/search?q=$pkg"
}

case "${1:-}" in
  search)  shift; cmd_search "$1" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
