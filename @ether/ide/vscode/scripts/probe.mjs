// probe.mjs DIR: the bundled language server in DIR/server answers on its own: initialize, then a document read, its
// statements found (no diagnostic) and its definitions listed
import { spawn } from 'child_process';
const dir = process.argv[2];
const child = spawn('node', [dir + '/server/.entrypoint.mjs', '--lsp'], { cwd: dir + '/server', stdio: ['pipe', 'pipe', 'inherit'] });
const send = (m) => { const b = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...m })); child.stdin.write(`Content-Length: ${b.length}\r\n\r\n`); child.stdin.write(b); };
const uri = 'file:///probe.ray', text = 'twice (x) => x + x\ntwice(21)\n';
let pending = Buffer.alloc(0);
const done = (ok, what) => { console.log(ok ? 'OK:' : 'FAILED:', what); child.kill(); process.exit(ok ? 0 : 1); };
child.stdout.on('data', (d) => {
  pending = Buffer.concat([pending, d]);
  for (;;) {
    const h = pending.indexOf('\r\n\r\n'); if (h < 0) return;
    const n = Number(/Content-Length: *(\d+)/i.exec(pending.subarray(0, h).toString())[1]); if (pending.length < h + 4 + n) return;
    const m = JSON.parse(pending.subarray(h + 4, h + 4 + n).toString()); pending = pending.subarray(h + 4 + n);
    if (m.id === 1) {
      console.log('INITIALIZE OK:', JSON.stringify(m.result).slice(0, 200));
      send({ method: 'initialized', params: {} });
      send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'ray', version: 1, text } } });
    } else if (m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri) {
      if (m.params.diagnostics.length) done(false, 'read with diagnostics ' + JSON.stringify(m.params.diagnostics));
      send({ id: 2, method: 'textDocument/documentSymbol', params: { textDocument: { uri } } });
    } else if (m.id === 2) {
      const names = (m.result ?? []).map((s) => s.name);
      done(names.includes('twice'), 'definitions ' + JSON.stringify(names));
    } else if (m.id !== undefined && m.method) send({ id: m.id, result: null });
  }
});
child.on('exit', (c) => done(false, 'exited ' + c));
send({ id: 1, method: 'initialize', params: { processId: process.pid, rootUri: null, capabilities: {} } });
setTimeout(() => done(false, 'timeout'), 120000);
