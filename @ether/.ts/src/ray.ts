import { fileURLToPath } from "url";
import { Runtime, String, AST } from "./language2.ts";
import {Standard, Version} from "./version.ts";
import { nodejs } from "./node.js.ts";

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

    program.interpreter = function(_: AST.Node): AST.Node {
      const INDEX_CHARS = 2;

      const name_of = (key: string | AST.Node): string => typeof key === 'string' ? key : (key.string ?? '');
      const indices = new WeakMap<AST.Node, Map<string, (string | AST.Node)[]>>();
      const index_for = (on: AST.Node): Map<string, (string | AST.Node)[]> => {
        let idx = indices.get(on);
        if (idx) return idx;
        idx = new Map();
        for (const key of on.methods.all() as Iterable<string | AST.Node>) {
          const name = name_of(key);
          if (!name) continue;
          const prefix = name.slice(0, INDEX_CHARS); // shorter names key on themselves
          let bucket = idx.get(prefix);
          if (!bucket) idx.set(prefix, bucket = []);
          bucket.push(key);
        }
        for (const bucket of idx.values()) bucket.sort((a, b) => name_of(b).length - name_of(a).length); // longest-first
        indices.set(on, idx);
        return idx;
      };

      const capture_longest_token = (cursor: AST.Node, on: AST.Node = cursor): false | string | AST.Node => {
        const idx = index_for(on);
        const src = cursor.source.value;
        const start = cursor.empty() ? cursor.cursor! : cursor.end! + 1; // read head
        // Try the longest indexed prefix first; a name shorter than INDEX_CHARS
        // lives under its own short prefix, so step the probe length down to 1.
        for (let len = INDEX_CHARS; len >= 1; len--) {
          if (start + len > src.length) continue;
          const bucket = idx.get(src.slice(start, start + len));
          if (!bucket) continue;
          for (const key of bucket) { // longest-first within the bucket
            const name = name_of(key);
            if (src.startsWith(name, start)) {
              let rem = name.length;
              cursor.capture_while(() => rem-- > 0);
              return key;
            }
          }
        }
        return false;
      };

      const expr = ({whitespace = 0}: { whitespace?: number } = {}): AST.Node => {
        _.skip_while(ch => ch.peek() === ' ' || ch.peek() === '\n');

        const expression = _.copy();
        let direction: -1 | 1 = 1
        // If type cannot be resolved/is variable, its at minimum a Node, so only that grammar will be available.

        // _.capture_while((ch: string) => ch !== ' ' && ch !== '\n');
        while(!_.done() && _.peek() !== '\n') {
          const result = _.copy()

          function candidate(cursor: AST.Node, on: AST.Node = cursor) { 
            const method = capture_longest_token(cursor, on);
            return ({
              self: cursor,
              method,
              resolve: function() { return cursor.methods.resolve(method); },
              call: function() {
                // if (cursor === on && on.methods.resolve(method).enabled('direction', cursor.direction.sign)) // 'Found method X but it wasnt flagged as {direction}'
                if (method) { cursor = cursor.get(method).call() } else { 
                  cursor.capture_while(ch => ch.peek() !== "\n") 
                  cursor.debug('deb', cursor === on ? 'on_result' : 'on_context')
                }
                return _ = cursor;
              }
            }) 
          }

          // Skip all the leading whitespace except one: We allow that single whitespace to be captured by a class. Used for function definitions.
          _.skip_while(ch => ch.peek(2) === '  ');

          const on_result = candidate(_.copy());
       
          // Calling from the context doesn't care about that single whitespace: You cannot call a context method which depends on a whitespace.
          const has_leading_whitespace = _.skip_while(ch => ch.peek() === ' ') !== 0;
          const on_context = candidate(_, program.GLOBAL); //TODO Change to actual context.
  
          // Start of the expression, get from context.
          if (expression.empty()) { on_context.call(); continue; }
          // Capture function arguments if there's a leading whitespace. Ex: dynamically assert A == B as dynamically(assert(A == B))
          // if (has_leading_whitespace && result.IS_FUNCTION_WITH_PARAMETERS) { result.call(expr()); continue; }
          // expr.result ==.instance_of Program && expr.result.parameters != None
          // This should actually just be implemented language-side. with a {" "}{expr: *} = on Program. So when you have a function, you cant actually call stuff on it with a space " ": func. is forced.

          // if (context.method && context.resolve().enabled('switch_direction')) { direction *= -1; }

          // We're simply in a callchain: a.b / a *
          on_result.call();
        }

        // Capture an indented block.
        while (!_.done()) {
          const at = _.copy();
          let n = 0;

          // Skip over irrelevant whitespace/newlines
          do {
            _.skip_while(ch => ch.peek() === '\n');
            n = _.skip_while(ch => ch.peek() === ' ');
          } while (!_.done() && _.peek() === '\n');

          const added_whitespace = n - whitespace;

          // First time we encounter something which is indented on the same line or before, we're no longer in our block.
          if (_.done() || added_whitespace <= 0) { _ = at; break; }

          expr({whitespace: n});
        }


        expression.end = _.end;
        return _;
      }

      while (!_.done()) { expr(); }

      return _;
    }
    
    await program.add(input.new().bundled.loadDirectory(cd, { recursively: true }).all())
    await program.add(input.all())

    return program
  })

const _isMainEntrypoint = (() => {
  if (!nodejs.enabled) return false;
  if (!process.argv[1]) return false;
  try { return fileURLToPath(import.meta.url) === nodejs.path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (_isMainEntrypoint) Ether.frontend(Ray.new().bundled.loadProject('@ether/.ts/test')).abstract().exec()