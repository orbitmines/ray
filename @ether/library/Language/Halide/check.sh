#!/usr/bin/env bash
# Halide is a C++ library; check if the header exists
[[ -f /usr/include/Halide.h ]] || [[ -f /usr/local/include/Halide.h ]] || [[ -f "$HOME/.local/include/Halide.h" ]]
