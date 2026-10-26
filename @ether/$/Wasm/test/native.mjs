// the native engine read with its events: R a end k, D a e kind, Y a end k, U a end
import { readFileSync } from 'node:fs';
const TEXT = 1048576, OUT = 5242880;
export const native = async (engine, text, trace = true) => {
  const memory = new WebAssembly.Memory({ initial: 1024 }); const events = [];
  const C = { 68: 'D', 82: 'R', 89: 'Y', 85: 'U', 65: 'A' };
  const CAP = +(process.env.EVCAP ?? 1e9); const ev = (kind, a, b, c) => { if (events.length > CAP) throw new Error('too many events'); events.push(kind === 85 ? `U ${a} ${b}` : `${C[kind]} ${a} ${b} ${c}`); return 0; };
  const log = (at) => { throw new Error('trap at ' + (at - TEXT)); };
  const { instance } = await WebAssembly.instantiate(engine, { m: { memory, log, ev } });
  const u8 = new Uint8Array(memory.buffer), i32 = new Int32Array(memory.buffer);
  u8.set(text, TEXT); i32[64 / 4] = text.length; i32[100 / 4] = trace ? 1 : 0;
  const t0 = performance.now(); const n = instance.exports.main(); const ms = performance.now() - t0;
  return { events, out: u8.slice(OUT, OUT + n), ms };
};
