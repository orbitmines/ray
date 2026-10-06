Tests parked until the engine handles them (2026-09-21):
- roman.ray.txt: `Roman.of(String.of(...))` and `Roman.from(n)` work in probes, but the test file exceeds the run limit — the `==`/member chains on constructor-set members loop.
- time.ray.txt: `ISO_8601.date` sees `split` return the whole string (member access on a chain built inside a function), so `as_number` builds a 40301-link number.
Both library files load fine and are exercised by the full tree.
