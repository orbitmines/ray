// One entry for both sides: `ether program.k2 …` is the client, `ether --daemon` the daemon it starts when there is none.
// `deno compile -A --no-config --include runtime/worker.ts --output ether cli/ether.ts` makes it one executable
// (add `--target x86_64-pc-windows-msvc`, `aarch64-apple-darwin`, `x86_64-apple-darwin`, `aarch64-unknown-linux-gnu`, …).

if (process.argv.includes('--daemon')) await import('./rayd.ts');
else await import('./ray.ts');
