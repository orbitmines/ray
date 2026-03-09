#!/usr/bin/env bash
exec python3 -c "from sympy import *; import code; code.interact(local=dict(globals(), **locals()))"
