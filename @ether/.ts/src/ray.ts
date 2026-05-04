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