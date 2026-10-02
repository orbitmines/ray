import { env, CLI, version } from './env.ts';
import { Diagnostics } from './diagnostics.ts';
import * as program from './program.ts';
import * as interpreter from './interpreter.ts';

export const Ray = { ...program, ...interpreter };

const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  { description: 'Print the version number.' },
  abstract: { alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    { alias: 'd', description: 'Enable the debugger and debug-level logging.' },
};

async function main([args, kwargs]: CLI.Args) {
  if (kwargs.version) return console.log(env.version.toString())
  if ((args.length === 0 && !kwargs.abstract) || kwargs.help) { console.log(CLI.help(cli)); return; }

  const diagnostics = new Diagnostics();
  await Ray.v0(diagnostics).abstract(!!kwargs.abstract).add(args.flatMap(x => env.at(x))).exec()

  if (env.nodejs && diagnostics.has_errors) process.exitCode = 1;
  diagnostics.print();
}

if (process.argv[1] !== undefined && import.meta.url === env.url.pathToFileURL(process.argv[1]).href) main(env.cli_args(cli));
