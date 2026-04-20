#!/usr/bin/env bash
python3 -c "import fractran" 2>/dev/null || [[ -f "${ETHER_EXTERNAL_DIR:-/tmp}/fractran/fractran.py" ]]
