// the native engine's host as the language runs: memory, `log`, `ev` (events, collected), `fetch` (an included file's text,
// `@./X.ray` beside the file being run, appended where the engine asks)
import { readFileSync, existsSync } from 'node:fs'; import { dirname, resolve } from 'node:path'; import { fileURLToPath } from 'node:url';
export const TEXT = 1048576;
export const host = async (engine, file, { mode = 1, trace = 0, pages = +(process.env.PAGES ?? 32000), notests = 0, from = 0, budget = +(process.env.TESTBUDGET ?? 20000), on = () => {} } = {}) => {
  const text = readFileSync(file); const memory = new WebAssembly.Memory({ initial: pages }); const files = [{ file, at: 0, text }];
  let i32v = null; const ev = (kind, a, b, c) => { on(kind, a, b, c, i32v); return 0; };
  const fetch = (m, n, at) => { const u8 = new Uint8Array(memory.buffer), i32 = new Int32Array(memory.buffer); const loc = Buffer.from(u8.subarray(i32[m / 4], i32[m / 4 + 1])).toString().trim();
    const p = loc === 'map' ? (process.env.MAP ?? fileURLToPath(new URL('../map.ray', import.meta.url))) : loc === 'level' ? (file.endsWith('.ray3') ? null : (process.env.LEVEL ?? fileURLToPath(new URL('../level.ray', import.meta.url)))) : loc.startsWith('@./') ? resolve(dirname(file), loc.slice(3)) : null; if (!p || !existsSync(p)) return 0; const t = readFileSync(p); u8.set(t, at); files.push({ file: p, at: at - TEXT, text: t }); return t.length; };
  const { instance } = await WebAssembly.instantiate(readFileSync(engine), { m: { memory, log: () => 0, ev, fetch } });
  const u8 = new Uint8Array(memory.buffer), i32 = new Int32Array(memory.buffer); i32v = i32; u8.set(text, TEXT); i32[16] = text.length; i32[25] = trace; i32[28] = mode; i32[164 / 4] = pages * 65536 - (8 << 20); i32[176 / 4] = 1e9; i32[188 / 4] = notests; i32[216 / 4] = budget; i32[272 / 4] = from ? TEXT + from : 0;
  const t0 = performance.now(); let error = null; try { instance.exports.main(); } catch (e) { error = e; }
  const where = (a) => { const f = [...files].reverse().find((x) => a >= x.at) ?? files[0]; const o = a - f.at; let e = o; while (e < f.text.length && f.text[e] !== 10) e++; return { file: f.file.split('/').pop(), line: f.text.subarray(0, o).toString().split('\n').length, text: f.text.subarray(o, Math.min(e, o + 80)).toString() }; };
  return { ms: Math.round(performance.now() - t0), error, where, i32, files, X: instance.exports, u8: new Uint8Array(memory.buffer) };
};
