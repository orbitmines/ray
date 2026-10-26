// node fuzz.mjs ENGINE N [SEED]: N random Expression setups, each read by the reference and the native engine, compared
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import { reference } from './ref.mjs'; import { native } from './native.mjs';
const engine = readFileSync(process.argv[2]); const N = +process.argv[3]; let seed = +(process.argv[4] ?? 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]; const chance = (p) => rnd() < p;
const BR = [['{', '}'], ['(', ')'], ['[', ']'], ['<', '>'], ['{{', '}}'], ['<%', '%>']], AR = ['=>', '->', ':=', '==>', '~>'];
const WORDS = ['a', 'b', 'go', 'say', 'make', 'it', 'x1', 'node', 'up', 'twice', 'run', 'hi', 'là'], OPS = ['+', '*', '|', '&&', '==', '.', ',', ';', '?', '!', '~', '@', '$'];
const program = () => {
  const [o, c] = pick(BR), ar = pick(AR); const H = (n) => `${o}${n}${c}`;
  const lines = [`!language   ${o} ${c}   ${H('LHS')} ${ar} ${H('RHS')}`, '', `${H('lhs')} ${ar} ${H('rhs')} ${ar} ${o}`, `  ${H('lhs')} ${ar} ${H('rhs')}`, c];
  const rules = []; const holes = ['p', 'q', 'r', 'body', 'v'];
  const head = () => {
    const parts = []; const n = 1 + Math.floor(rnd() * 4); const used = [];
    if (chance(0.15)) { const [po, pc] = pick([['(', ')'], ['[', ']'], ['"', '"'], ['`', '`'], ['|', '|']]); const h = pick(holes); return { text: `${po}${H(h)}${pc}`, holes: [h] }; }
    for (let i = 0; i < n; i++) {
      if (chance(0.5)) { const h = pick(holes); used.push(h); parts.push(chance(0.1) ? `${o}${h}: ${pick(['Name', 'Word', 'T'])}${c}` : H(h)); }
      else parts.push(chance(0.6) ? pick(WORDS) : pick(OPS));
    }
    let text = parts.join(chance(0.85) ? ' ' : ''); if (chance(0.1)) text = H('this') + text;
    return { text, holes: used };
  };
  const body = (hs, depth) => {
    const opts = [() => 'external .', () => 'external &', () => pick(WORDS), () => hs.length ? H(pick(hs)) : 'external .', () => hs.length ? pick(hs) : '.', () => `${pick(WORDS)} ${pick(WORDS)}`,
      () => rules.length ? use(rules[Math.floor(rnd() * rules.length)], depth + 1, hs) : 'external .'];
    if (chance(0.3) && depth < 2) { const inner = head(); return { multi: true, lines: [`${inner.text} ${ar} ${pick(opts)()}`, pick(opts)()] }; }
    if (chance(0.3)) return { multi: true, lines: [pick(opts)(), pick(opts)()] };
    return { multi: false, text: pick(opts)() };
  };
  const use = (r, depth, hs = []) => r.text.replace(new RegExp(`${o.replace(/[[\]{}()<>%]/g, '\\$&')}(\\w+)(: \\w+)?${c.replace(/[[\]{}()<>%]/g, '\\$&')}`, 'g'), () => depth > 2 ? pick(WORDS) : chance(0.3) && rules.length ? `(${use(pick(rules), depth + 1, hs)})` : pick(WORDS));
  const n = 3 + Math.floor(rnd() * 10);
  for (let i = 0; i < n; i++) {
    const r = head(); const b = body(r.holes, 0);
    if (chance(0.1)) { lines.push(`${pick(WORDS)} (${pick(holes)}) ${ar} ${b.multi ? b.lines[0] : b.text}`); continue; }
    if (b.multi) { const bracket = chance(0.5); lines.push(`${r.text} ${ar}${bracket ? ' ' + o : ''}`); for (const l of b.lines) lines.push('  ' + l); if (bracket) lines.push(c); }
    else lines.push(`${r.text} ${ar} ${b.text}`);
    rules.push(r);
    const uses = Math.floor(rnd() * 3); for (let j = 0; j < uses; j++) lines.push(use(pick(rules), 0));
    if (chance(0.15)) lines.push(`${pick(WORDS)}.${pick(WORDS)}`);
    if (chance(0.1)) lines.push(`// ${pick(WORDS)} ${pick(OPS)}`);
    if (chance(0.05)) lines.push('');
  }
  for (let j = 0; j < 4; j++) lines.push(use(pick(rules), 0));
  return lines.join('\n') + '\n';
};
const FAIL = new URL(`file://${(await import('node:os')).tmpdir()}/ray-fuzzfail/`); mkdirSync(FAIL, { recursive: true }); let same = 0, diff = 0, refErr = 0; const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const s0 = seed; const text = Buffer.from(program()); let r, nn;
  try { r = reference(text); } catch (e) { refErr++; continue; }
  try { nn = await native(engine, text); } catch (e) { nn = { events: ['NATIVE-ERR ' + String(e).slice(0, 80)], out: new Uint8Array() }; }
  let k = 0; while (k < r.events.length && r.events[k] === nn.events[k]) k++;
  if (k === r.events.length && k === nn.events.length) same++;
  else { diff++; if (diff <= 5) { writeFileSync(new URL(`f${s0}.ray`, FAIL), text); console.log(`DIFF seed ${s0} at ${k}/${r.events.length}: ref ${r.events[k]} native ${nn.events[k]}`); } }
}
console.log(`${same} same, ${diff} different, ${refErr} the reference could not read, in ${Date.now() - t0} ms`);
process.exit(diff ? 1 : 0);
