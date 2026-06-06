import { fileURLToPath } from "url";
import { Runtime, String, AST } from "./language.ts";
import {Standard, Version} from "./version.ts";
import { nodejs } from "./node.js.ts";
import { Instrumentable, instrumented } from "./diagnostics.ts";
import { Text } from "./source.ts";
import { is_string } from "./lodash.ts";

export const Ray = String.extension(".ray")
export const Ether = new Runtime('Ether', (Version.scheme('E') as Standard).create(0, '2027-01-01', 0))
  .abstract(fn => {
    // if (fn.enabled('refuse_abstract_interpretation')) {
    //   fn.debug('abstract', 'Refused to abstractly call function, defaulting to its return type.')
    //   return fn;
    // }
    // TODO Time/trace the function allow it to go own for a small while in certain configurations/cache certain results.

    return fn;
  })
  .register_frontend(Ray, async (target, input) => {
    const program = target.new()

    program.base(_ => {
      _.method('external', (_class, method, args) => {
        args.with('external')

        _class.realize()
        const name = args.string?.trim();
        if (!name) { args.error('external', '`external` requires a method name as its argument.'); return args; }
        //args.debug('test', [...self.methods.all()].join(', '))
        if (!_class.methods.has(name)) return args.error('external', `Expected method \`${name}\` to be externally defined by the runtime, but it wasn't`);
        return args;
      }).with('callable', 'Program')

      _.method('left-to-right', (_class, method, args) => args.with('left-to-right')).with('callable', 'Program')
      _.method('right-to-left', (_class, method, args) => args.with('right-to-left')).with('callable', 'Program')
      _.method('left-associative', (_class, method, args) => args.with('associativity', 'left')).with('callable', 'Program')
      _.method('right-associative', (_class, method, args) => args.with('associativity', 'right')).with('callable', 'Program')
  
      _.method('test-middle', (_class, method, args) => _class)
      _.method('test-right', (_class, method, args) => {
        method.info('test', `test-right fired on \`${_class.string ?? '?'}\``);
        return _class;
      }).with('callable', 'Program')
      _.method('test-left', (_class, method, args) => {
        method.info('test', `test-left fired on \`${_class.string ?? '?'}\``);
        return _class;
      })

      // Stand-ins so the associativity test cases can run end-to-end (real
      // resolution will be wired up later). All `callable` infix methods log
      // their source column so the test reads the firing order off the
      // trace; the operator's actual associativity is stamped via the
      // `external <left|right>-associative <name>` lines in the fixture.
      _.method('F', (_class, method, args) => {
        method.info('test', `F fired`);
        return method;
      })
      _.method('x', (_class, method, args) => {
        method.info('test', `x@${method.col} fired on F@${_class.col ?? '?'} with F@${args.col ?? '?'}`);
        return _class;
      }).with('callable')
      _.method('M', (_class, method, args) => {
        method.info('test', `M@${method.col} fired on F@${_class.col ?? '?'} with F@${args.col ?? '?'}`);
        return _class;
      }).with('callable')
      _.method('N', (_class, method, args) => {
        method.info('test', `N@${method.col} fired on F@${_class.col ?? '?'} with F@${args.col ?? '?'}`);
        return _class;
      }).with('callable')
      _.method('X', (_class, method, args) => {
        method.info('test', `X@${method.col} fired on F@${_class.col ?? '?'} with F@${args.col ?? '?'}`);
        return _class;
      }).with('callable')
    })

    const cd = '@ether/$/.ray'
    // input.new().bundled.load(`${cd}/Node.ray`)

    const interpreter = new Interpreter(program);
    program.interpreter = interpreter.interpret.bind(interpreter);
    
    // await program.add(input.new().bundled.loadDirectory('@ether/.ray3', { recursively: true }).all())
    // await program.add(input.new().bundled.loadDirectory('@ether/.ray2', { recursively: true }).all())
    await program.add(input.new().bundled.loadDirectory(cd, { recursively: true }).all())
    await program.add(input.all())

    return program
  })

@instrumented('trace')
class Interpreter implements Instrumentable {

  public _: AST.Node

  // Seed with a real node so `position` is valid at the instrumentation
  // wrapper's entry on the first `interpret` call — it reads `position`
  // before the body assigns `this._`, and an undefined node leaves the
  // frame without a ctx, so its timing wouldn't nest under `load`.
  constructor(private program: Runtime) { this._ = program.BASE; }

  get position() { return this._; }
  get __instrumentation() { return this.program; }

  interpret(_: AST.Node) {
    this._ = _;
    while (!this._.done()) { this.expr(); }
    return this._;
  }

  candidate(cursor: AST.Node, on: AST.Node = cursor) { 
    const _this = this;
    let method = this.capture_longest_token(cursor, on);
    return ({
      self: cursor,
      method,
      resolve: function() { return method ? cursor.methods.resolve(method) : cursor.None; },
      call: function() {
        let skip_line = false;
        // if (cursor === on && on.methods.resolve(method).enabled('direction', cursor.direction.sign)) // 'Found method X but it wasnt flagged as {direction}'
        if (!method) {
          method = cursor.capture_while(ch => ch.peek() !== ' ' && ch.peek() !== '\n')
          if (!method) { cursor.skip_while(ch => ch.peek() === ' '); return _this._ = cursor; }

          cursor.debug('deb', cursor === on ? 'on_result' : 'on_context')
          skip_line = true;
        }

        //TODO This should be automatic.
        const m = on.get(method);
        m.source = cursor.source;
        m.cursor = cursor.cursor;
        m.selection = cursor.selection.slice();

        const result = m.call();
        // result.before = cursor;
        result.source = cursor.source;
        result.cursor = cursor.cursor;
        result.selection = cursor.selection.slice();
        cursor = result;
        cursor.debug('deb', cursor === on ? 'found on result' : 'found on context')

        if (skip_line)
          cursor.skip_while(ch => ch.peek() !== '\n') // Consume rest of the line which we wont interpret because method is unresolved.

        return _this._ = cursor;
      }
    }) 
  }

  expr({whitespace = 0}: { whitespace?: number } = {}): AST.Node {
    //TODO Should trigger reinterpretation of other dependant files? or what's the best way of calculating what depends on what.

    this._.skip_while(ch => ch.peek() === ' ' || ch.peek() === '\n');

    const expression = this._.copy();
    let direction: -1 | 1 = 1
    // If type cannot be resolved/is variable, its at minimum a Node, so only that grammar will be available.

    // _.capture_while((ch: string) => ch !== ' ' && ch !== '\n');
    let first = true;
    while(!this._.done() && this._.peek() !== '\n') {
      // const result = this._.copy()

      // Skip all the leading whitespace except one: We allow that single whitespace to be captured by a class. Used for function definitions.
      this._.skip_while(ch => ch.peek(2) === '  ');

      const [a, b] = [this._.copy(), this._];
 
      // Start of the expression, get from context.
      if (first) {
        // Calling from the context doesn't care about that single whitespace: You cannot call a context method which depends on a whitespace.
        const has_leading_whitespace = a.skip_while(ch => ch.peek() === ' ') !== 0;
        a._super = this._.program.GLOBAL; //TODO Change to actual context.
        const on_context = this.candidate(a);

        on_context.call();
        first = false;
        continue;
      }
      // Capture function arguments if there's a leading whitespace. Ex: dynamically assert A == B as dynamically(assert(A == B))
      // if (has_leading_whitespace && result.IS_FUNCTION_WITH_PARAMETERS) { result.call(expr()); continue; }
      // expr.result ==.instance_of Program && expr.result.parameters != None
      // This should actually just be implemented language-side. with a {" "}{expr: *} = on Program. So when you have a function, you cant actually call stuff on it with a space " ": func. is forced.

      // if (context.method && context.resolve().enabled('switch_direction')) { direction *= -1; }

      // We're simply in a callchain: a.b / a *
      const on_result = this.candidate(b);
      on_result.call();
    }

    // Capture an indented block.
    while (!this._.done()) {
      const at = this._.copy();
      let n = 0;

      // Skip over irrelevant whitespace/newlines
      do {
        this._.skip_while(ch => ch.peek() === '\n');
        n = this._.skip_while(ch => ch.peek() === ' ');
      } while (!this._.done() && this._.peek() === '\n');

      const added_whitespace = n - whitespace;

      // First time we encounter something which is indented on the same line or before, we're no longer in our block.
      if (this._.done() || added_whitespace <= 0) { this._ = at; break; }

      this.expr({whitespace: n});
    }


    expression.end = this._.end;
    return this._;
  }

  capture_longest_token(cursor: AST.Node, on: AST.Node = cursor): false | string | AST.Node {
    if (cursor.done()) return false;

    const idx = on.methods.index();

    const bucket = idx.get(cursor.peek()); //TODO Other direction needs to support as well; ends with char X.
    // if ' ', check 2 first
    if (!bucket) return false;
    
    for (const key of bucket) { // longest-first within the bucket
      if (cursor.peek(key.length) === key) {
        cursor.capture_n(key.length)
        return key;
      }
    }

    return false;
  };

}

const _isMainEntrypoint = (() => {
  if (!nodejs.enabled) return false;
  if (!process.argv[1]) return false;
  try { return fileURLToPath(import.meta.url) === nodejs.path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (_isMainEntrypoint) {
  const ether = Ether.frontend(Ray.new()).abstract()
  await ether.exec()
  ether.print()
}