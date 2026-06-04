#!/usr/bin/env node
import { Ether, Ray } from '../ray.ts';
import { start } from './server.ts';

start(Ether.frontend(Ray.new()));
