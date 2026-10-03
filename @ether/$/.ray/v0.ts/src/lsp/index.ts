#!/usr/bin/env node
import { Ray } from '../language.ts';
import { Diagnostics } from '../language/diagnostics.ts';
import { start } from './server.ts';

start(Ray.lsp(new Diagnostics()));
