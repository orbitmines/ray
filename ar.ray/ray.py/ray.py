from __future__ import annotations

def __ray__(*GLOBAL_ARGS, **GLOBAL_KWARGS):
  class Ray:
    pass

  return Ray

Ray = __ray__()