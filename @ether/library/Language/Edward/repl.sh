#!/usr/bin/env bash
exec python3 -c "import edward; print('Edward loaded'); import code; code.interact(local={'edward': edward})"
