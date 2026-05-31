// Working example: C++ toolchains as a recursive frontend/backend graph.
//
//   source ──(String frontend)──▶ Cpp ──backend──▶ toolchain ──backend──▶ place
//                                                   (gcc/zig…)             (apt, pacman,
//                                                                          dnf, brew,
//                                                                          official, github)
//
//   Every "place" to get a tool is a Source backend with one shape:
//     list()           -> all versions available there        (discovery)
//     resolve(version) -> the artifact URL
//     install(t, v)     -> download into  .ether/external/@/<host>/<path>
//                          realize into   .ether/external/@/<tool>/<version>
//
//   Listing walks the graph and aggregates every place × version. Because the
//   graph is recursive, .backend(node) selects ANY node and the transitive walk
//   resolves the path to it — no special selector.
//
//   Usage:  Cpp.frontend(src.loadFile("main.cpp")).backend(zig).exec()

import { Representation, String as Str } from "./language2.ts";
import { Diagnostics } from "./diagnostics.ts";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";

const q = (s: string) => JSON.stringify(s);
const present = (probe: string): boolean => { try { execSync(probe, { stdio: "ignore" }); return true; } catch { return false; } };
const ARCH = ({ x64: "x86_64", arm64: "aarch64" } as Record<string, string>)[process.arch] ?? process.arch;
const ARCH_DEB = ({ x64: "amd64", arm64: "arm64" } as Record<string, string>)[process.arch] ?? process.arch;
const OSN  = ({ linux: "linux", darwin: "macos", win32: "windows" } as Record<string, string>)[process.platform] ?? process.platform;

const EXTERNAL = path.resolve(".ether", "external");
const downloadPath = (url: string) => { const u = new URL(url); return path.join(EXTERNAL, "@", u.host, decodeURIComponent(u.pathname)); };
const installPath  = (tool: string, version: string) => path.join(EXTERNAL, "@", tool, version);

async function sourceOf(r: Representation): Promise<string> {
  let s = ""; for await (const x of (r as any).all()) s += (x as any).value ?? ""; return s;
}
async function getJSON(url: string): Promise<any> { return (await fetch(url)).json(); }

function fetchTo(url: string, timeout?: number): string {
  const dest = downloadPath(url);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execSync(`curl -fsSL ${q(url)} -o ${q(dest)}`, { stdio: ["ignore", "inherit", "inherit"], timeout });
  return dest;
}
function extract(file: string, into: string, strip = 1, timeout?: number) {
  fs.mkdirSync(into, { recursive: true });
  const sh = (cmd: string) => execSync(cmd, { timeout, stdio: ["ignore", "ignore", "inherit"] });
  if (/\.tar\.xz$|\.txz$/.test(file))      sh(`tar -xJf ${q(file)} -C ${q(into)} --strip-components=${strip}`);
  else if (/\.tar\.gz$|\.tgz$/.test(file)) sh(`tar -xzf ${q(file)} -C ${q(into)} --strip-components=${strip}`);
  else if (/\.tar\.zst$/.test(file))       sh(`tar --use-compress-program=unzstd -xf ${q(file)} -C ${q(into)} --strip-components=${strip}`);
  else if (/\.deb$/.test(file))            sh(`dpkg-deb -x ${q(file)} ${q(into)}`);
  else if (/\.rpm$/.test(file))            sh(`cd ${q(into)} && rpm2cpio ${q(file)} | cpio -idm --quiet`);
  else if (/\.zip$/.test(file))            sh(`unzip -oq ${q(file)} -d ${q(into)}`);
  else throw new Error(`don't know how to extract ${file}`);
}
// dpkg-style version comparison (handles epoch `:`, revision `-`, and `~`).
function vorder(c: string): number { if (c === "") return 0; if (c === "~") return -1; if (/[a-zA-Z]/.test(c)) return c.charCodeAt(0); return c.charCodeAt(0) + 256; }
function vpart(a: string, b: string): number {
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    while ((i < a.length && !/\d/.test(a[i])) || (j < b.length && !/\d/.test(b[j]))) {
      const ac = i < a.length && !/\d/.test(a[i]) ? a[i] : "";
      const bc = j < b.length && !/\d/.test(b[j]) ? b[j] : "";
      const d = vorder(ac) - vorder(bc); if (d) return d;
      if (ac) i++; if (bc) j++;
    }
    let an = "", bn = "";
    while (i < a.length && /\d/.test(a[i])) an += a[i++];
    while (j < b.length && /\d/.test(b[j])) bn += b[j++];
    const d = (parseInt(an || "0", 10)) - (parseInt(bn || "0", 10)); if (d) return d;
  }
  return 0;
}
function vcompare(va: string, vb: string): number {
  const parse = (v: string) => {
    let epoch = 0, rest = v; const ci = v.indexOf(":");
    if (ci >= 0) { epoch = parseInt(v.slice(0, ci), 10) || 0; rest = v.slice(ci + 1); }
    const hi = rest.lastIndexOf("-");
    return { epoch, upstream: hi >= 0 ? rest.slice(0, hi) : rest, revision: hi >= 0 ? rest.slice(hi + 1) : "" };
  };
  const a = parse(va), b = parse(vb);
  return (a.epoch - b.epoch) || vpart(a.upstream, b.upstream) || vpart(a.revision, b.revision);
}
function pickLatest(versions: string[]): string { return [...versions].sort((a, b) => vcompare(b, a))[0]; }

// ── a place to get a tool: list + resolve + (shared) install ─────────────────
abstract class Source extends Representation<Source> {
  log: Diagnostics = new Diagnostics();
  cfg: Record<string, any> = {};
  with(cfg: Record<string, any>): this { const x = this.new() as this; x.cfg = { ...this.cfg, ...cfg }; return x; }
  available(): boolean { return true; }                 // remote places work anywhere

  abstract list(): Promise<string[]>;
  abstract resolve(version: string): Promise<string>;
  bin(prefix: string): string { return path.join(prefix, this.cfg.bin ?? ""); }

  async install(tool: string, version: string, timeout?: number): Promise<string> {
    const into = installPath(tool, version);
    const b = this.bin(into);
    if (!fs.existsSync(b)) { extract(fetchTo(await this.resolve(version), timeout), into, this.cfg.strip ?? 1, timeout); }
    return b;
  }
}

// portable upstream build (e.g. ziglang.org) — cross-distro, fully usable
class Official extends Source {
  protected construct(): Official { return new Official(); }
  constructor() { super("official"); }
  private _i?: any; private async idx() { return this._i ??= await getJSON(this.cfg.index); }
  async list() { return Object.keys(await this.idx()).filter(k => /^\d+\.\d+/.test(k)); }
  async resolve(v: string) { const e = (await this.idx())[v]?.[`${ARCH}-${OSN}`]; if (!e?.tarball) throw new Error(`official: no ${ARCH}-${OSN} build for ${v}`); return e.tarball; }
}
// github releases — pick the asset for this os/arch
class Github extends Source {
  protected construct(): Github { return new Github(); }
  constructor() { super("github"); }
  async list() { const r = await getJSON(`https://api.github.com/repos/${this.cfg.repo}/releases?per_page=100`); return (r as any[]).map(x => x.tag_name.replace(/^v/, "")); }
  async resolve(v: string) {
    const r = await getJSON(`https://api.github.com/repos/${this.cfg.repo}/releases`);
    const rel = (r as any[]).find(x => x.tag_name.replace(/^v/, "") === v) ?? r[0];
    const asset = rel.assets.find((a: any) => a.name.includes(ARCH) && a.name.includes(OSN));
    if (!asset) throw new Error(`github: no ${ARCH}/${OSN} asset in ${this.cfg.repo} ${v}`);
    return asset.browser_download_url;
  }
}
// foreign package managers — each lists from its index and resolves an artifact
class Apt extends Source {
  protected construct(): Apt { return new Apt(); }
  constructor() { super("apt"); }
  available() { return present("command -v apt-get"); }
  // ALL versions from the Debian snapshot archive (not just the host's repos)
  async list() { try { const j = await getJSON(`https://snapshot.debian.org/mr/binary/${this.cfg.pkg}/`); return [...new Set((j.result ?? []).map((r: any) => r.binary_version as string))]; } catch { return []; } }
  // resolve from the snapshot archive too, so any LISTED version is installable
  async resolve(v: string) {
    const j = await getJSON(`https://snapshot.debian.org/mr/binary/${this.cfg.pkg}/${encodeURIComponent(v)}/binfiles?fileinfo=1`);
    const want = (j.result ?? []).find((r: any) => r.architecture === ARCH_DEB) ?? (j.result ?? []).find((r: any) => r.architecture === "all") ?? (j.result ?? [])[0];
    if (!want) throw new Error(`apt: no binfile for ${this.cfg.pkg}=${v}`);
    return `https://snapshot.debian.org/file/${want.hash}`;
  }
}
class Pacman extends Source {           // remote: Arch package API + Arch Linux Archive
  protected construct(): Pacman { return new Pacman(); }
  constructor() { super("pacman"); }
  // ALL versions from the Arch Linux Archive directory listing
  private ala() { return `https://archive.archlinux.org/packages/${this.cfg.pkg[0]}/${this.cfg.pkg}/`; }
  async list() {
    try {
      const html = await (await fetch(this.ala())).text();
      const re = new RegExp(`${this.cfg.pkg}-([\\w.+]+-\\d+)-(?:x86_64|any)\\.pkg\\.tar\\.(?:zst|xz)"`, "g");
      const set = new Set<string>(); let m: RegExpExecArray | null;
      while ((m = re.exec(html))) set.add(m[1]);
      return [...set];
    } catch { return []; }
  }
  async resolve(v: string) { return `${this.ala()}${this.cfg.pkg}-${v}-${ARCH}.pkg.tar.zst`; }
}
class Dnf extends Source {              // remote: Fedora Koji build history (full)
  protected construct(): Dnf { return new Dnf(); }
  constructor() { super("dnf"); }
  private async koji(method: string, paramXml: string): Promise<string> {
    const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params><param>${paramXml}</param></params></methodCall>`;
    return (await fetch("https://koji.fedoraproject.org/kojihub", { method: "POST", headers: { "Content-Type": "text/xml" }, body })).text();
  }
  async list() {
    try {
      const idXml = await this.koji("getPackageID", `<value><string>${this.cfg.pkg}</string></value>`);
      const id = idXml.match(/<int>(\d+)<\/int>/);
      if (!id) return [];
      const xml = await this.koji("listBuilds", `<value><int>${id[1]}</int></value>`);
      const prefix = `${this.cfg.pkg}-`;
      const nvrs = [...xml.matchAll(/<name>nvr<\/name>\s*<value><string>([^<]+)<\/string>/g)].map(m => m[1]);
      return [...new Set(nvrs.filter(n => n.startsWith(prefix)).map(n => n.slice(prefix.length)))];
    } catch { return []; }
  }
  async resolve(_v: string): Promise<string> { throw new Error("dnf: rpm url resolution not wired in this example"); }
}
class Brew extends Source {             // remote: formulae.brew.sh
  protected construct(): Brew { return new Brew(); }
  constructor() { super("brew"); }
  // stable + all @-versioned formulae (brew core keeps only these)
  async list() {
    try {
      const j = await getJSON(`https://formulae.brew.sh/api/formula/${this.cfg.pkg}.json`);
      const vs = new Set<string>([j.versions?.stable].filter(Boolean) as string[]);
      for (const f of j.versioned_formulae ?? []) { const m = String(f).match(/@(.+)$/); if (m) vs.add(m[1]); }
      return [...vs];
    } catch { return []; }
  }
  async resolve(_v: string): Promise<string> { throw new Error("brew: bottle url resolution not wired in this example"); }
}
// build from a git source — versions are git tags; branches are selectable too
class GitSource extends Source {
  protected construct(): GitSource { return new GitSource(); }
  constructor() { super("source"); }
  private refs(kind: "--tags" | "--heads"): string[] {
    try {
      const out = execSync(`git ls-remote ${kind} ${q(this.cfg.repo)}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const pre = kind === "--tags" ? "refs/tags/" : "refs/heads/";
      const s = new Set<string>();
      for (const line of out.split("\n")) { const t = line.indexOf("\t"); if (t < 0) continue; const r = line.slice(t + 1); if (r.startsWith(pre) && !r.endsWith("^{}")) s.add(r.slice(pre.length)); }
      return [...s];
    } catch { return []; }
  }
  // versions = git tags, filtered to real releases (cfg.releases) so pickLatest
  // doesn't grab vendor/init tags like `vendors/ARM/...` or `llvmorg-23-init`.
  async list() {
    const tags = this.refs("--tags");
    const re: RegExp | undefined = this.cfg.releases;
    return re ? tags.filter(t => re.test(t)) : tags;
  }
  branches(): string[] { return this.refs("--heads"); }  // selectable branches
  async resolve() { return this.cfg.repo; }
  // clone at the tag/branch into @/<host>/<path>, build into @/<tool>/<version>
  async install(tool: string, version: string, timeout?: number): Promise<string> {
    const into = installPath(tool, version);
    const b = this.bin(into);
    if (fs.existsSync(b)) return b;
    const u = new URL(this.cfg.repo.replace(/^git:\/\//, "https://"));
    const srcDir = path.join(EXTERNAL, "@", u.host, decodeURIComponent(u.pathname.replace(/\.git$/, "")), version);
    if (!fs.existsSync(srcDir)) execSync(`git clone --depth 1 --branch ${q(version)} ${q(this.cfg.repo)} ${q(srcDir)}`, { stdio: ["ignore", "ignore", "inherit"], timeout });
    execSync(this.cfg.build(srcDir, into), { stdio: ["ignore", "ignore", "inherit"], shell: "/bin/bash", timeout });
    return b;
  }
}

// ── a toolchain: backends are places; knows how to compile via its bin ───────
class Toolchain extends Representation<Toolchain> {
  protected construct(): Toolchain { return new Toolchain(this.name!, this.compile); }
  log: Diagnostics = new Diagnostics();
  constructor(name: string, public compile: (bin: string, src: string, out: string) => string) { super(name); }
}

// the edge configures the generic place for this tool (meaningful, not identity)
const at = (cfg: Record<string, any>) => async (s: Representation) => (s as Source).with(cfg);

// install via the first available place; return the usable bin
async function ensure(tc: Toolchain, want?: string): Promise<string> {
  for (const [src, edge] of tc.backends.next) {
    if (!(src instanceof Source)) continue;
    const place = (await edge(src, tc)) as Source;
    if (!place.available()) continue;
    let v = want;                                  // explicit tag/branch/version wins
    if (!v) { const vs = await place.list(); if (!vs.length) continue; v = pickLatest(vs); }
    place.log.info(tc.name!, `installing ${tc.name}@${v} via ${src.name} -> ${installPath(tc.name!, v)}`);
    return place.install(tc.name!, v);
  }
  throw new Error(`${tc.name}: no available place could install it`);
}

// list every place × versions for a toolchain
async function places(tc: Toolchain): Promise<{ place: string; versions: string[] }[]> {
  const out: { place: string; versions: string[] }[] = [];
  for (const [src, edge] of tc.backends.next) {
    if (!(src instanceof Source)) continue;
    if (src instanceof GitSource) continue;   // shown separately (tags + branches)
    const place = (await edge(src, tc)) as Source;
    // list every place regardless of whether it's installable on THIS host
    try { out.push({ place: src.name!, versions: await place.list() }); } catch { out.push({ place: src.name!, versions: [] }); }
  }
  return out;
}

// the Cpp→toolchain edge: install (if needed), compile, run
function run_with(tc: Toolchain) {
  return async (_t: Representation, prog: Representation): Promise<string> => {
    const bin = await ensure(tc, (prog as any)._version);   // honor .version("<tag|branch>")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpp-"));
    const file = path.join(dir, "main.cpp"); fs.writeFileSync(file, await sourceOf(prog));
    const out = path.join(dir, "a.out");
    execSync(tc.compile(bin, file, out), { stdio: ["ignore", "inherit", "inherit"] });
    return execSync(q(out), { encoding: "utf8" });
  };
}

// ── the C++ language: one class is language + instance + program ─────────────
class CppLanguage extends Representation<CppLanguage> {
  protected construct(): CppLanguage { return new CppLanguage(); }
  log: Diagnostics = new Diagnostics();
  _toolchain?: Representation;
  _version?: string;
  version(v: string): this { this._version = v; return this; }   // pin a tag/branch/version
  constructor() { super("c++"); }
  // @ts-ignore — specialize base backend(): keep the program chainable; transitive
  // find() means you can select any node in the recursive graph.
  backend(node: Representation): CppLanguage {
    if (!this.class.backends.find(x => x.name === node.name)) return this.log.fatal("c++", `No C++ backend named '${node.name}'.`);
    this._toolchain = node;
    return this;
  }
  async exec(...args: string[]): Promise<string> {
    if (!this._toolchain) return this.log.fatal("c++", "Select a backend with .backend(...) before .exec().");
    const compile = this.class.backends.find(x => x.name === this._toolchain!.name)!;
    return (await compile(this._toolchain, this)) as any;
  }
}
const passthrough = async (target: Representation, input: Representation) => { const p = target.new(); (p as any).all = (input as any).all.bind(input); return p as any; };

// ── wiring: shared place singletons, configured per toolchain on the edge ─────
const official = new Official(), github = new Github(), apt = new Apt(), pacman = new Pacman(), dnf = new Dnf(), brew = new Brew();

export const zig = new Toolchain("zig", (b, s, o) => `${q(b)} c++ ${q(s)} -o ${q(o)}`);
zig.register_backend(official, at({ index: "https://ziglang.org/download/index.json", bin: "zig" }));
zig.register_backend(github,   at({ repo: "ziglang/zig", bin: "zig" }));

export const gcc = new Toolchain("gcc", (b, s, o) => `${q(b)} ${q(s)} -o ${q(o)}`);
gcc.register_backend(apt,    at({ pkg: "g++",     bin: "usr/bin/g++" }));
gcc.register_backend(pacman, at({ pkg: "gcc",     bin: "usr/bin/g++", strip: 0 }));
gcc.register_backend(dnf,    at({ pkg: "gcc", bin: "usr/bin/g++" }));   // Koji indexes by source pkg
gcc.register_backend(brew,   at({ pkg: "gcc",     bin: "bin/g++" }));

export const clang = new Toolchain("clang", (b, s, o) => `${q(b)} ${q(s)} -o ${q(o)}`);
clang.register_backend(apt,    at({ pkg: "clang", bin: "usr/bin/clang++" }));
clang.register_backend(pacman, at({ pkg: "clang", bin: "usr/bin/clang++", strip: 0 }));
clang.register_backend(dnf,    at({ pkg: "clang", bin: "usr/bin/clang++" }));
clang.register_backend(brew,   at({ pkg: "llvm",  bin: "bin/clang++" }));

// build-from-source backend (git): versions = tags, branches selectable
const source = new GitSource();
zig.register_backend(source,   at({ repo: "https://github.com/ziglang/zig.git",       bin: "zig",         releases: /^\d+\.\d+\.\d+$/,        build: (s: string, p: string) => `cmake -S ${q(s)} -B ${q(s)}/build -DCMAKE_INSTALL_PREFIX=${q(p)} -DCMAKE_BUILD_TYPE=Release && cmake --build ${q(s)}/build --target install -j$(nproc)` }));
gcc.register_backend(source,   at({ repo: "https://github.com/gcc-mirror/gcc.git",    bin: "bin/g++",     releases: /^releases\/gcc-\d+\.\d+\.\d+$/, build: (s: string, p: string) => `cd ${q(s)} && ./contrib/download_prerequisites && ./configure --prefix=${q(p)} --enable-languages=c,c++ --disable-multilib && make -j$(nproc) && make install` }));
clang.register_backend(source, at({ repo: "https://github.com/llvm/llvm-project.git", bin: "bin/clang++", releases: /^llvmorg-\d+\.\d+\.\d+$/,   build: (s: string, p: string) => `cmake -S ${q(s)}/llvm -B ${q(s)}/build -G Ninja -DLLVM_ENABLE_PROJECTS=clang -DCMAKE_INSTALL_PREFIX=${q(p)} -DCMAKE_BUILD_TYPE=Release && ninja -C ${q(s)}/build install` }));

export const Cpp = new CppLanguage();
Cpp.register_frontend(Str.extension(".cpp", ".hpp", ".cc"), passthrough);
Cpp.register_backend(zig,   run_with(zig));
Cpp.register_backend(gcc,   run_with(gcc));
Cpp.register_backend(clang, run_with(clang));

// ── demo ─────────────────────────────────────────────────────────────────────
const SOURCE = `#include <iostream>
int main() {
#if defined(__clang__)
  std::cout << "hello from clang " << __clang_major__ << "." << __clang_minor__ << "\\n";
#elif defined(__GNUC__)
  std::cout << "hello from gcc " << __GNUC__ << "." << __GNUC_MINOR__ << "\\n";
#else
  std::cout << "hello from c++\\n";
#endif
}
`;

export async function demo(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpp-src-"));
  const srcFile = path.join(dir, "main.cpp"); fs.writeFileSync(srcFile, SOURCE);

  // install from a place and compile (zig official build — cross-distro, isolated)
  try { process.stdout.write(`[zig] ${await Cpp.frontend(Str.extension(".cpp").loadFile(srcFile)).backend(zig).exec()}`); }
  catch (e: any) { console.log(`[zig] skipped: ${e.message}`); }

  // list ALL places × versions for each toolchain (native + remote, cross-distro)
  for (const tc of [zig, gcc, clang]) {
    for (const { place, versions } of await places(tc)) {
      console.log(`  ${tc.name} @ ${place}: ${versions.length ? `${versions.length} ver(s), latest ${pickLatest(versions)}` : "—"}`);
    }
    // build-from-source: tags are the versions; branches are selectable
    for (const [src, edge] of tc.backends.next) {
      if (!(src instanceof GitSource)) continue;
      const gs = (await edge(src, tc)) as GitSource;
      const tags = await gs.list(), br = gs.branches();
      console.log(`  ${tc.name} @ source: ${tags.length} tags, ${br.length} branches (e.g. ${br.slice(0, 3).join(", ")}) — pick via .version("<tag|branch>")`);
    }
  }
}

const sec = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

// 2nd demo: actually install from EVERY backend, compile + run, report per-backend.
// Heavy source builds are capped by TIMEOUT_MS (default 8 min) each.
export async function demo2(): Promise<void> {
  const TIMEOUT = Number(process.env.TIMEOUT_MS ?? 8 * 60_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpp-test-"));
  const srcFile = path.join(dir, "main.cpp"); fs.writeFileSync(srcFile, SOURCE);
  console.log(`testing every backend (cap ${Math.round(TIMEOUT / 1000)}s each)…\n`);

  for (const tc of [zig, gcc, clang]) {
    for (const [src, edge] of tc.backends.next) {
      if (!(src instanceof Source)) continue;
      const place = (await edge(src, tc)) as Source;
      const label = `${tc.name} @ ${src.name}`.padEnd(18);
      const t0 = Date.now();
      try {
        const versions = await place.list();
        if (!versions.length) { console.log(`  ${label} —    (no versions listed)`); continue; }
        const v = pickLatest(versions);
        const bin = await place.install(tc.name!, v, TIMEOUT);
        const out = path.join(dir, `out.${tc.name}.${src.name}`);
        execSync(tc.compile(bin, srcFile, out), { stdio: ["ignore", "ignore", "ignore"], timeout: TIMEOUT, shell: "/bin/bash" });
        const res = execSync(q(out), { encoding: "utf8", timeout: 60_000 }).trim();
        console.log(`  ${label} OK   ${v}  (${sec(t0)})  ${res}`);
      } catch (e: any) {
        console.log(`  ${label} FAIL ${String(e.message || e).split("\n")[0].slice(0, 90)}  (${sec(t0)})`);
      }
    }
  }
}

const isMain = (() => { try { return import.meta.url === `file://${process.argv[1]}`; } catch { return false; } })();
if (isMain) (process.argv[2] === "2" ? demo2 : demo)();
