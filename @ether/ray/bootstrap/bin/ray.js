#!/usr/bin/env node
process.env.ETHER_COMMAND ??= 'ray';
const { start } = await import('../.entrypoint.mjs');
await start();
