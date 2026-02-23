import {Ether} from "./v0.3.ts";

const runtime_args = (result: Ether.PartialArgs = {}) => {
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

Ether.run("..", runtime_args())
