import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const scorer = join(root, '@ether/v0.ts/scripts/score.mjs');
const scorePath = join(root, '@ether/v0.ts/score.json');
const kernelPaths = [/^@ether\/v0\.ts\/src\//, /^@ether\/ray\/\.entrypoint\.ray/];

function input() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function decide(permissionDecision, permissionDecisionReason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } }));
  process.exit(0);
}

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : [];
}

function isTest(path) {
  return /^@ether\/.*\/tests\/.*\.ray$/.test(path) && !path.startsWith('@ether/v0.ts/') && !basename(path).startsWith('.');
}

function sessionStart() {
  if (!existsSync(scorePath)) {
    console.log('Ray: no score yet. Run `node @ether/v0.ts/scripts/score.mjs --write` (Verification.md V1).');
    return;
  }
  const { commit, totals: t } = JSON.parse(readFileSync(scorePath, 'utf8'));
  console.log(`Ray score at ${commit}: ${t.passed} of ${t.claims} claims pass, ${t.failed} fail, ${t.errored} error. A commit that makes a passing claim in a test file it touches fail is refused; edits to the kernel ask first (AGENTS.md).`);
}

function checkEdit(path) {
  if (!path) return;
  const rel = relative(root, path);
  if (kernelPaths.some(p => p.test(rel))) decide('ask', `${rel} is the kernel: changes need the user (Plan.md §1).`);
}

function checkCommit(command) {
  if (/co-authored-by|generated with/i.test(command)) decide('deny', 'Commits carry the user\'s name only: no Co-Authored-By, no "Generated with" (Plan.md §1).');
  const tests = [...new Set([...git(['diff', 'HEAD', '--name-only']), ...git(['ls-files', '--others', '--exclude-standard'])])]
    .filter(isTest).filter(path => existsSync(join(root, path))).map(path => relative(join(root, '@ether'), join(root, path)));
  if (tests.length === 0 || !existsSync(scorePath)) return;
  const r = spawnSync(process.execPath, [scorer, '--check', ...tests], { cwd: dirname(dirname(scorer)), encoding: 'utf8' });
  const lines = (r.stdout + r.stderr).split('\n');
  if (r.status === 1) decide('deny', `The ratchet refuses this commit (Verification.md V1.2):\n${lines.filter(l => l.startsWith('REGRESSED')).join('\n')}\nFix it, or accept it with \`score.mjs --write\` and say why in the commit.`);
  if (r.status !== 0) decide('ask', `The scorer could not check this commit (exit ${r.status}):\n${lines.filter(Boolean).slice(-5).join('\n')}`);
}

const mode = process.argv[2];
if (mode === 'session-start') sessionStart();
else if (mode === 'pre-tool') {
  const event = input();
  const args = event.tool_input ?? {};
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(event.tool_name)) checkEdit(args.file_path ?? args.notebook_path);
  if (event.tool_name === 'Bash' && /\bgit\b[^|;&]*\bcommit\b/.test(args.command ?? '')) checkCommit(args.command);
}
else {
  process.stderr.write('usage: gate.mjs session-start | pre-tool (hook input as JSON on stdin)\n');
  process.exit(2);
}
