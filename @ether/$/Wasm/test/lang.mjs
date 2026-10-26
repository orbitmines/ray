// node test/lang.mjs FILE [SEED.pu]: the native engine (bootstrap.wasm) running FILE as the language (RUNMODE: goto, labels,
// `afterwards`, `report`, `&` as the application's vertex, styles that are code run), each test and whether it passed (it said
// nothing); given a seed's suite results (a `.pu` file of PASS lines), how many agree
import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
const [f, pu] = process.argv.slice(2); const text = readFileSync(f); const TEXT = 1048576;
const memory = new WebAssembly.Memory({ initial: 1024 }); const tests = []; let said = 0;
const ev = (kind, a, b) => { if (kind === 84) tests.push([a, b]); else if (kind === 83) said++; return 0; };
const { instance } = await WebAssembly.instantiate(readFileSync(fileURLToPath(new URL('../bootstrap.wasm', import.meta.url))), { m: { memory, log: () => 0, ev } });
const u8 = new Uint8Array(memory.buffer), i32 = new Int32Array(memory.buffer); u8.set(text, TEXT); i32[16] = text.length; i32[25] = 1; i32[28] = 1;
const t0 = performance.now(); instance.exports.main(); const ms = Math.round(performance.now() - t0);
const textOf = (a) => { let e = a; while (e < text.length && text[e] !== 10) e++; return text.subarray(a, e).toString().replace(/\s*\/\/.*$/, '').trim(); };
const passed = tests.filter(([, failed]) => !failed).length;
let line = `${tests.length} tests: ${passed} passed, ${tests.length - passed} failed; ${said} said; ${ms} ms`;
if (pu) { const name = f.split('/').pop(), seed = readFileSync(pu, 'utf8').split('\n').filter((l) => l.includes(`${name}: `)).map((l) => l.split(`${name}: `)[1].replace(/…$/, '').trim());
  const agree = tests.filter(([a, failed]) => { const t = textOf(a); return seed.some((s) => t.startsWith(s) || s.startsWith(t.slice(0, 100))) === !failed; }).length; line += `; ${agree} agree with the seed (which passes ${seed.length})`; }
console.log(line);
