import { parseLanguageDefinition } from "./expression.ts";
import fs from "fs";

const source = fs.readFileSync("./../ray/bootstrap/.entrypoint.ray3", 'utf-8');

const definition = parseLanguageDefinition(source);

console.log("Bootstrap syntax:", definition.syntax);
console.log("Grammar rule:");
console.dir(definition.grammarRule, { depth: null });

console.log("Ordinary rules:");
console.dir(definition.rules, { depth: null });