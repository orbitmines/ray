#!/usr/bin/env node
import { Ray, Diagnostics } from '../minimal4.ts';
import { start } from './server.ts';

start(Ray.lsp(new Diagnostics()));
