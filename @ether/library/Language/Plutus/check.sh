#!/usr/bin/env bash
command -v plutus >/dev/null 2>&1 || (command -v cabal >/dev/null 2>&1 && command -v ghc >/dev/null 2>&1)
