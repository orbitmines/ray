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
      while (!_.done()) {
        _.skip_while(ch => ch.peek() === ' ' || ch.peek() === '\n');

        const expression = _.copy();
        let direction: -1 | 1 = 1
        // If type cannot be resolved/is variable, its at minimum a Node, so only that grammar will be available.

        // _.capture_while((ch: string) => ch !== ' ' && ch !== '\n');
        while(!_.done() || _.peek() === '\n') {
          function candidate(cursor: AST.Node, on: AST.Node = cursor) { 
            const method = cursor.capture_longest_token(on); // TODO Move capture in separate methodf
            return ({
              self: cursor,
              method,
              resolve: function() { return cursor.methods.resolve(method); },
              call: function() {
                // if (cursor === on && on.methods.resolve(method).enabled('direction', cursor.direction.sign)) // 'Found method X but it wasnt flagged as {direction}'
                if (method) { cursor = cursor.get(method).call() } else { cursor.skip_while(ch => ch.peek() !== "\n") }
                return _ = cursor;
              }
            }) 
          }

          // Skip all the leading whitespace except one: We allow that single whitespace to be captured by a class. Used for function definitions.
          _.skip_while(ch => ch.peek(2) === '  ');

          const result = candidate(_.copy());
       
          // Calling from the context doesn't care about that single whitespace: You cannot call a context method which depends on a whitespace.
          _.skip_while(ch => ch.peek() === ' ')
          const context = candidate(_, program.GLOBAL); //TODO Change to actual context.
  
          // Start of the expression, get from context.
          if (expression.empty()) { context.call(); continue; }
          
          // if (context.method && context.resolve().enabled('switch_direction')) { direction *= -1; }

          //  if expr.result ==.instance_of Program && expr.result.parameters != None && leading_whitespace ~= " "⊣
                // We got a method call without parenthesis: 'external test' instead of 'external(test)'
          //    return ({expr.compose(result => result(.))}: static) //TODO Context is expr.context.parent

          if (result.self.IS_FUNCTION_WITH_PARAMETERS) {  }
          if (result.method) { result.call(); continue; }

          // for a b
          // dynamically accepts a block as a function, so dynamically assert wouldnt be possible. Or it is actually assert inside a dynamically block.
          // dynamically assert A == B
          // Prefer this actually if it accepts a Program as a parameter. So that you dont conflict with a .A property. (Force a . for accessing the A)
          // Always a function call? ONLY IF THERE'S A LEADING ' '. 
          // TODO push to args, but parse the whole rest expression?
          args.push(context.call())
        }

        expression.end = _.end;

      }

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