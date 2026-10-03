import { Text } from './text.ts';
import { env } from './env.ts';
import { engine_hash, source_hash } from './boot.ts';

type Stored = [number, number, string, string | undefined, string | undefined][];

const root = (): string | undefined => {
  if (!env.nodejs) return undefined;
  const configured = process.env.RAY_PAINTS;
  if (configured === 'off') return undefined;
  return configured ?? env.path.join(env.import<typeof import('os')>('os').homedir(), '.cache', 'ray-scratch', 'paints');
};
const ROOT = root();

export class Paints {
  private loaded = new Map<string, { key: string; paints: Text.Node[] | undefined }>();
  private saved = new Map<string, string>();
  constructor(private language: () => Text.Source[]) {}
  private language_hash?: { of: string; hash: string };
  key(src: Text.Source): string | undefined {
    const engine = engine_hash();
    if (ROOT === undefined || engine === undefined || src.location === undefined || !src.loaded) return undefined;
    const language = this.language().filter(other => other.loaded).map(other => `${other.location}:${source_hash(other)}`).join('\n');
    if (this.language_hash?.of !== language) this.language_hash = { of: language, hash: env.import<typeof import('crypto')>('crypto').createHash('sha1').update(language).digest('hex') };
    return env.import<typeof import('crypto')>('crypto').createHash('sha1').update(`${engine}\n${this.language_hash.hash}\n${src.location}\n${source_hash(src)}`).digest('hex');
  }
  cached(src: Text.Source): Text.Node[] | undefined {
    const key = this.key(src);
    if (key === undefined) return undefined;
    const held = this.loaded.get(src.location);
    if (held?.key === key) return held.paints;
    let paints: Text.Node[] | undefined;
    try {
      const stored = JSON.parse(env.fs.readFileSync(env.path.join(ROOT!, `${key}.json`), 'utf-8')) as Stored;
      const anchor = new Text.Node(src);
      paints = stored.map(([begin, end, style, of, defines]) => { const node = anchor.span(begin, end); node.style = style; node.of = of; node.defines = defines; return node; });
    } catch { paints = undefined; }
    this.loaded.set(src.location, { key, paints });
    return paints;
  }
  save(src: Text.Source, paints: Text.Node[]) {
    const key = this.key(src);
    if (key === undefined) return;
    const stored: Stored = paints.map(paint => [paint.begin, paint.end, paint.style as string, paint.of, typeof paint.defines === 'string' ? paint.defines : undefined]);
    try {
      env.fs.mkdirSync(ROOT!, { recursive: true });
      env.fs.writeFileSync(env.path.join(ROOT!, `${key}.json`), JSON.stringify(stored));
      this.saved.set(src.location, key);
      this.loaded.set(src.location, { key, paints });
    } catch { }
  }
}
