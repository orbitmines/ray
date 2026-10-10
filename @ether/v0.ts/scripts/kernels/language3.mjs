import { readFileSync } from 'fs';
import { libraryFiles, located, projectsBefore, serve } from './kernel.mjs';

const STEPS = Number(process.env.RAY_STEPS ?? 300000);

class RanAway extends Error {}

function unread(statement, text) {
  return /[A-Za-z]/.test(text) && statement.includes(text) && !statement.includes(`"${text}"`) && !statement.includes(`\`${text}\``);
}

function lineTag(line) {
  return ` @@line${line}`;
}

function statementsOf(p, text) {
  const lines = text.split('\n'), kept = [];
  lines.forEach((line, i) => { if (line.trim() && !line.trim().startsWith('//')) kept.push({ line, at: i + 1 }); });
  const base = Math.min(...kept.map(({ line }) => line.length - line.trimStart().length));
  const statements = [];
  let depth = 0;
  for (const { line: whole, at } of kept) {
    const line = whole.slice(base);
    if (statements.length && (depth > 0 || line.charCodeAt(0) === 32 || line.charCodeAt(0) === 9 || line.charCodeAt(0) === 10 || line.charCodeAt(0) === 13)) {
      statements[statements.length - 1].text += '\n' + line;
      statements[statements.length - 1].lines.push({ line, at });
    }
    else statements.push({ text: line.trimEnd(), at, lines: [{ line, at }] });
    depth += p.nesting(line);
  }
  return statements;
}

await serve({
  name: 'language3',
  runner: new URL(import.meta.url),
  modules: { language: 'language3.ts' },
  async read({ modules: { language: { Program, Text } }, file, text, say }) {
    const source = (location, value) => Object.assign(new Text.Source(), { location, value });
    const entrypoint = located('language3', '.entrypoint.ray2');
    const p = new Program(source(entrypoint, readFileSync(entrypoint, 'utf8')));
    await p.compile();
    let steps = 0, unreadNow = new Set();
    const read = p.read;
    p.read = function (s, ...rest) {
      if (++steps > STEPS) throw new RanAway(`ran away after ${STEPS} steps`);
      const value = read.call(this, s, ...rest);
      if (typeof value === 'string' && !s.startsWith('"') && !s.startsWith('`') && /[A-Za-z]/.test(value) && value === p.source(s)) unreadNow.add(value.trim());
      return value;
    };
    const run = statement => { steps = 0; unreadNow = new Set(); return p.run(statement, { node: p.global }); };
    const quietly = statement => { try { run(statement); } catch {} };
    quietly(readFileSync(located('language3', 'js3.kinds.ray'), 'utf8'));
    const before = [...libraryFiles(), ...projectsBefore(file).flatMap(project => project.files)];
    for (const f of before) for (const { text: statement } of statementsOf(p, readFileSync(f, 'utf8'))) quietly(statement);
    const report = (line, message) => say(line, message.replace(/\s@@line\d+/g, ''));
    const tagged = text.split('\n').map((line, i) => line.replace(/INFO@mark(\s*)`([^`]*)`/g, (_, space, message) => `INFO@mark${space}\`${message}${lineTag(i + 1)}\``)).join('\n');
    for (const { text: statement, at, lines } of statementsOf(p, tagged)) {
      const claimLines = lines.filter(({ line }) => line.includes('INFO@mark')).map(({ at: n }) => n);
      const sayAll = message => { for (const n of new Set([at, ...claimLines])) report(n, message); };
      const reported = p.reports.length;
      let value;
      try { value = run(statement); }
      catch (e) { sayAll(`Failed: ${e?.message ?? e}`); continue; }
      for (const r of p.reports.slice(reported)) {
        const tagged = /^(.*)\s@@line(\d+)$/s.exec(String(p.source(r.caps?.message ?? '')).trim().replace(/^`([^`]*)`$/, '$1'));
        if (tagged) report(Number(tagged[2]), tagged[1]);
        else report(at, String(p.source(r.caps?.message ?? '')).trim());
      }
      if (typeof value === 'string') unreadNow.add(value.trim());
      for (const text of unreadNow) if (unread(statement, text)) sayAll(`Unread \`${text.split('\n')[0]}\``);
    }
  },
});
