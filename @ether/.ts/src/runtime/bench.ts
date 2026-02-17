import { createContext, parse, _matcher, Token } from './parser.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

type Scope = Record<string, any>;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rayDir = path.resolve(__dirname, '../../../.ray');

function collectRayFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectRayFiles(full));
    else if (entry.name.endsWith('.ray')) results.push(full);
  }
  return results;
}

const rayFiles = collectRayFiles(rayDir);
const allContent = rayFiles.map(f => fs.readFileSync(f, 'utf-8')).join('\n');
console.log(`Loaded ${rayFiles.length} .ray files, total ${allContent.length} chars, ${allContent.split('\n').length} lines`);

function buildGrammar() {
  const ctx = createContext();
  ctx.empty_line = ctx.regex(/[ \t]*\n/);
  const RULE_NAME = ctx.Array(ctx.not(' ')[``], '{', ctx.Expression, '}', ctx.not(' ')[``])[``];
  const RULE_ONLINE_BODY = ctx.Any(
    ctx.Array(ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 1), ctx.Any(ctx.Array('(', ctx.val(' ')[``], ')').bind(ctx.parenthesis), ctx.val('=>')), ctx.statement.optional),
    ctx.Array(ctx.val(' ')[``], ctx.end)
  );
  ctx.PROPERTIES = ctx.Array(
    ctx.Array(ctx.Any(RULE_NAME.bind(ctx.property_name), ctx.not('\n')), ctx.Any(' & ', ' | ').optional)[``].constrain((x: any) => x.length, '>=', 1).bind(ctx.properties),
    RULE_ONLINE_BODY.bind(ctx.property_body)
  );
  ctx.statement = ctx.Array(
    ctx.empty_line[``], ctx.PROPERTIES.bind(ctx.content), ctx.Any(';', '\n', ctx.end),
    ctx.Array(ctx.empty_line[``], ctx.val(' ')[``].constrain((x: any) => x.length, '==', 'indent'),
      ctx.val(' ')[``].constrain((x: any) => x.length, '>=', 1).bind(ctx.added),
      ctx.statement.with((scope: Scope) => ({...scope, indent: scope.indent + scope.added.count}))
    )[``].bind(ctx.children)
  );
  ctx.Expression = ctx.statement[``].bind(ctx.statements);
  return ctx;
}

const ctx = buildGrammar();
parse(ctx.Expression, allContent, { indent: 0 }); // warmup

const iterations = 10;
const times: number[] = [];
for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  const result = parse(ctx.Expression, allContent, { indent: 0 });
  times.push(performance.now() - start);
  if (i === 0) console.log(`Parse: success=${result.success}, consumed=${result.consumed}/${allContent.length}`);
}
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`Benchmark (${iterations} iters): avg=${avg.toFixed(1)}ms min=${Math.min(...times).toFixed(1)}ms max=${Math.max(...times).toFixed(1)}ms`);
