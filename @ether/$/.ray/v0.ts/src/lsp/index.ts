#!/usr/bin/env node
import { Ray, Diagnostics } from '../language.ts';
import { start } from './server.ts';

start(Ray.lsp(new Diagnostics()));
