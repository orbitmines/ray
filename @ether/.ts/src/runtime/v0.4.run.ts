import { Ray, buildCalc, describe } from "./v0.4.ts";

const runtime_args = (result: Record<string, string[]> = {}) => {
  const args = process.argv.slice(2);
  let using_default_entrypoint = true;

  const add = (key: string, expression: string) => {
    if (key == '@' && using_default_entrypoint) {
      result['@'] = [];
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
      // short flags (ignored for now)
    } else {
      add('@', arg);
    }
  }

  return result;
};

const args = runtime_args();

// --lang=calc runs the Calc test language
if (args['lang']?.[0] === 'calc') {
  const Calc = buildCalc();
  console.error('Calc test language:');
  const testExprs = args['eval'] ?? ['5 + 3', 'x = 10', 'x * 2'];
  for (const expr of testExprs) {
    console.log(`  ${expr} => ${describe(Calc.eval(expr))}`);
  }
  if (args['repl']) {
    Calc.repl({ prompt: 'Calc> ' });
  }
} else {
  Ray.run('..', {
    '@': args['@'],
    eval: args['eval'],
    repl: args['repl'] ? 'Ray> ' : undefined,
    quiet: !!args['quiet'],
  });
}
