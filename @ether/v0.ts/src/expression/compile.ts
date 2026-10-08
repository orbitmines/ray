// compile.ts — an optional layer: some of the language's rules given an equivalent in the host's language, applied in their place.
// Each answers exactly what the rule's functionality answers (the same definitions, made the same way, through the host's `defined`),
// without applying the rules that functionality is written with. Deleting this file (or not calling `accelerate`) changes no result,
// only time. A rule is taken only when its functionality is written exactly as below; written otherwise, it is read as written.
import { Host, Ray, Code, Value } from './expression.ts';

type Native = (h: Host, F: Ray, eq: any) => unknown;
// (functionality as written → what answers it; `FALLBACK`: read it as written after all)
export const FALLBACK = Symbol('read as written');
const natives = new Map<string, Native>();

// the code of a capture word written at `word` inside a rule's functionality, read where `at` is
const spot = (eq: any, word: string, from: number, at: Ray): Code => {
  const s = eq.body.text.s, i = s.indexOf(word, eq.body.b + from);
  return new Code(eq.body.text, i, i + word.length, at);
};
// what a block read into a value made where `F` is read (`&` read in it: `& &+= { … }`) is read into
const applied = (F: Ray): Ray => { let r: Ray = F; if (r.scope && r.rule && r.caller) r = r.caller; if (r.scope && r.into) r = r.into; return r; };
const block = (h: Host, written: Ray, into: Ray): Ray => { let r = into; if (r.scope && r.rule && r.caller) r = r.caller; if (r.scope && r.into) r = r.into; const T = new Ray(written); T.scope = true; T.into = r; T.sees = r; return T; };
const amp = (F: Ray) => { if (!F.has('caller')) F.m.set('caller', F.caller); return F; };

// `{declared_name Unspaced} := {declared_value Expression} =>  & &+= { declared_name => declared_value }`
natives.set('& &+= { declared_name => declared_value }', (h, F, eq) => {
  const T = block(h, F, amp(F)), off = eq.body.s.indexOf('{');
  h.defined(spot(eq, 'declared_name', off, T), spot(eq, 'declared_value', off, T), T, true);
  return F;
});
// `{member_on Expression}.{member_name Word} := {member_value Expression} =>` (three statements)
natives.set(`member_at := member_on ?? (@made Node)
  member_on ?? (& &+= { member_on => member_at })
  member_at &+= { member_name => member_value }`, (h, F, eq) => {
  const on = F.m.get('member_on'), none = on === undefined || on === h.none;
  const at = none ? new Ray(h.base) : on;
  // (`member_at := …`: a value of the frame)
  const tm = { name: '', s: 'member_at' };
  h.add(F, [{ lit: 'member_at' }], new Value(at, new Code(tm, 0, tm.s.length, F)));
  if (none) { const T = block(h, F, amp(F)), off = eq.body.s.indexOf('{'); h.defined(spot(eq, 'member_on', off, T), spot(eq, 'member_at', off, T), T, true); }
  const T2 = block(h, F, at as Ray), off2 = eq.body.s.lastIndexOf('{');
  h.defined(spot(eq, 'member_name', off2, T2), spot(eq, 'member_value', off2, T2), T2, true);
  return at;
});

export function accelerate(h: Host) {
  (h as any).accelerated = (eq: any) => {
    const n = natives.get(eq.body.s.trim()); if (!n) return undefined;
    return (F: Ray) => n(h, F, eq);
  };
}
