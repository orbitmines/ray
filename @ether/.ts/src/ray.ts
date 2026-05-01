import path from "path";
import { fileURLToPath } from "url";
import { Runtime, String } from "./language2.ts";
import {Standard, Version} from "./version.ts";

export const Ray = String.extension(".ray")
export const Ether = new Runtime('Ether', (Version.scheme('E') as Standard).create(0, '2027-01-01', 0))
  .register_frontend(Ray, (target, input) => {
    input.bundled.loadDirectory('@ether/$/.ray', { recursively: true })
    
    return target
  })

const _isMainEntrypoint = (() => {
  if (!process.argv[1]) return false;
  try { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (_isMainEntrypoint) Ether.frontend(Ray.new()).abstract().exec()