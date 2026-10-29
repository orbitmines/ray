#!/usr/bin/env node
process.env.ETHER_COMMAND ??= 'orbitmines';
const { start } = await import('../.entrypoint.mjs');
await start();
