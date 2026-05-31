import { demo, demo2 } from './index.ts';
// `tsx src/index.run.ts`    -> demo  (install zig + list every place × versions)
// `tsx src/index.run.ts 2`  -> demo2 (install + compile + run via EVERY backend)
//    TIMEOUT_MS=900000 tsx src/index.run.ts 2   # raise the per-backend cap (default 8 min)
const fn = process.argv[2] === '2' ? demo2 : demo;
fn().catch(e => { console.error(e); process.exit(1); });
