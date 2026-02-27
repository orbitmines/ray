#!/usr/bin/env bash
exec python3 -c "import discopy; print('DisCoPy loaded'); import code; code.interact(local={'discopy': discopy})"
