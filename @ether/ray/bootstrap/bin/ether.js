#!/usr/bin/env node
process.env.ETHER_COMMAND ??= 'ether';
const { start } = await import('../.entrypoint.mjs');
await start();
