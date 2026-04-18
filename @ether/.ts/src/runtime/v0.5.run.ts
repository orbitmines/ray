import * as fs from "fs";
import {Language, Ray} from "./v0.5.ts";

const runtime_args = (result: { [key: string]: string[] } = {}): [string[], { [key: string]: string[] }] => {
  const args = process.argv.slice(2);

  let location: string[] = [];

  const add = (key: string, expression: string) => {
    if (key in result) result[key].push(expression);
    else result[key] = [expression];
  };

  for (let i = 0; i < args.length; i++) {
    let arg = args[i];

    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, value] = arg.slice(2).split("=");
      add(key, value);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);

      if (args[i + 1] && !args[i + 1].startsWith("-"))
        add(key, args[++i]);
      else
        add(key, "true");
    } else if (arg.startsWith("-")) {
    } else {
      location.push(arg);
    }
  }

  // Piped stdin (e.g. `cat file.ray | ray`) is read once and appended to eval.
  if (!process.stdin.isTTY) { add('eval', fs.readFileSync(0, "utf-8")) }

  return [location, result];
}

const [location, args] = runtime_args();

const language: Language = Ray;
language.cli(location, args)