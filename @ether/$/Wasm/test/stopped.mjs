// node stopped.mjs ENGINE FILE: the top-level statements stopped by the reading budget, and unread ones said, by file
import { host } from './host.mjs';
const [eng, f] = process.argv.slice(2); const tops = []; let depth = 0;
const r = await host(eng, f, { trace: 1, notests: 1, on: (k, a, b, c) => { if (k === 90) tops.push([a, c]); if (k === 93) depth++; } });
const stopped = []; for (let i = 0; i < tops.length; i++) { const nx = tops[i + 1]; if (nx && nx[1]) stopped.push(tops[i][0]); }
console.log(tops.length, 'statements', stopped.length, 'stopped', r.ms, 'ms', 'depth', depth);
for (const a of stopped) { const w = r.where(a); console.log(`${w.file}:${w.line}`.padEnd(24), w.text.slice(0, 80)); }
