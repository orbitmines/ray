#!/usr/bin/env node
import { Ray, Diagnostics } from '../minimal3.ts';
import { start } from './server.ts';

start(Ray.lsp(new Diagnostics()));
