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
      }).with('accepts_program')

      _.method('left-to-right', (_class, method, args) => args.with('left-to-right')).with('accepts_program')
      _.method('right-to-left', (_class, method, args) => args.with('right-to-left')).with('accepts_program')
      _.method('left-associative', (_class, method, args) => args.with('associativity', 'left')).with('accepts_program')
      _.method('right-associative', (_class, method, args) => args.with('associativity', 'right')).with('accepts_program')
  
      _.method('test-middle', (_class, method, args) => _class)
      _.method('test-right', (_class, method, args) => {
        method.info('test', `test-right fired on \`${_class.string ?? '?'}\``);
        return _class;
      }).with('accepts_program')
      _.method('test-left', (_class, method, args) => {
        method.info('test', `test-left fired on \`${_class.string ?? '?'}\``);
        return _class;
      })

      // Stand-ins so the associativity test cases can run end-to-end (real
      // resolution will be wired up later). All `accepts` infix methods log
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
      }).with('accepts')
      _.method('M', (_class, method, args) => {
        method.info('test', `M@${method.col} fired on F@${_class.col ?? '?'} with F@${args.col ?? '?'}`);
        return _class;
      }).with('accepts')
      _.method('N', (_class, method, args) => {
        method.info('test', `N@${method.col} fired on F@${_class.col ?? '?'} with F@${args.col ?? '?'}`);
        return _class;
      }).with('accepts')
      _.method('X', (_class, method, args) => {
        method.info('test', `X@${method.col} fired on F@${_class.col ?? '?'} with F@${args.col ?? '?'}`);
        return _class;
      }).with('accepts')
    })

    const cd = '@ether/$/.ray'
    // input.new().bundled.load(`${cd}/Node.ray`)

    program.interpreter = function(_: AST.Node): AST.Node {
      let saw_newline = false;
      _.skip_while((ch: string) => {
        if (ch === '\n') saw_newline = true;
        return ch === ' ' || ch === '\n';
      });

      _.capture_while((ch: string) => ch !== ' ' && ch !== '\n');
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