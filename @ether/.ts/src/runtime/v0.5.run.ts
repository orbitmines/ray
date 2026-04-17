import * as fs from "fs";
import {Language, Ray} from "./v0.5.ts";

const runtime_args = (result: { [key: string]: string[] } = {}) => {
  const args = process.argv.slice(2);
  let using_default_entrypoint = true;

  const add = (key: string, expression: string) => {
    if (key == '@' && using_default_entrypoint) {
      result['@'] = []
      using_default_entrypoint = false;
    }

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
      add('ENTRYPOINT', arg)
    }
  }

  return result;
}

const args = runtime_args();

// Piped stdin (e.g. `cat file.ray | ray`) is read once and appended to eval.
if (!process.stdin.isTTY) {
  const piped = fs.readFileSync(0, "utf-8");
  if (piped.length > 0) (args.eval ??= []).push(piped);
}

const language: Language = Ray;
language.cli("..", args)