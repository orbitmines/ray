// The browser example: an environment in the page (workers when the page is cross-origin isolated, WebGPU for lanes).
// `?run=name` runs an example as soon as the page loads.

import { web } from '../host/web.ts';
import { Environment } from '../runtime/environment.ts';
import { assemble } from '../core/assembly.ts';

const examples = ['superpose', 'entries', 'exits', 'loop', 'each'];
const $ = (id: string) => document.getElementById(id) as any;
const host = await web({ worker: '/dist/worker.js' });
const env = new Environment(host, { words: 1 << 22 });
$('info').textContent = `${host.threads} workers, ${host.gpu ? 'WebGPU' : 'no GPU'}`;

for (const name of examples) $('example').add(new Option(name, name));
const load = async (name: string) => { $('source').value = await (await fetch(`/examples/${name}.k2`)).text(); };
$('example').onchange = () => load($('example').value);

async function run() {
  const source = $('source').value, out = $('out');
  out.textContent = '';
  try {
    const program = env.load(source, assemble(source));
    const t = performance.now();
    const values = await env.run(program, 'main', [], { out: text => { out.textContent += text; } }).done;
    out.textContent += `=> ${values.map(v => env.show(v)).join(' | ')}   (${(performance.now() - t).toFixed(1)} ms)\n`;
  } catch (e) { out.textContent += String(e); }
  document.title = 'done';
}
$('run').onclick = run;

const requested = new URLSearchParams(location.search).get('run');
$('example').value = requested ?? examples[0];
await load($('example').value);
if (requested) await run();
