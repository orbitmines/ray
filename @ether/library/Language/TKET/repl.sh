#!/usr/bin/env bash
exec python3 -c "from pytket import Circuit; import code; code.interact(local=dict(globals(), **locals()))"
