export type Values = Record<string, number | string>;

export abstract class VersionScheme {
  abstract readonly letter: string;

  abstract parse(tail: string): Values;
  abstract format(values: Values): string;
  abstract toSemver(version: Version, opts?: { scheme?: boolean }): string;
}

const MONTH_LETTERS = 'ABCDEFGHIJKL';

export class Standard extends VersionScheme {
  readonly letter = 'E';

  parse = (tail: string): Values => {
    const m = /^(\d+)\.(\d+)([A-L])\.(\d+)$/.exec(tail);
    if (!m) throw new Error(`E-scheme: cannot parse tail "${tail}"`);
    const [, year, yearsSinceRelease, monthsSinceRelease, index] = m;
    return {
      year: parseInt(year, 10),
      yearsSinceRelease: parseInt(yearsSinceRelease, 10),
      monthsSinceRelease,
      month: MONTH_LETTERS.indexOf(monthsSinceRelease) + 1,
      index: parseInt(index, 10),
    };
  };

  format = (p: Values): string =>
    `${p.year}.${p.yearsSinceRelease}${p.monthsSinceRelease}.${p.index}`;

  toSemver = (version: Version, opts?: { scheme?: boolean }): string => {
    const ysr   = version.values.yearsSinceRelease as number;
    const month = version.values.month as number;
    const idx   = version.values.index as number;
    const base  = `${version.major}.${ysr * 12 + month}.${idx}`;
    if (!opts?.scheme) return base;
    return `${base}-${this.letter}${this.format(version.values)}`;
  };

  create = (major: number, releaseDate: string, index: number): Version => {
    const release = new Date(releaseDate);
    const now = new Date();
    const monthsTotal = Math.max(0,
      (now.getFullYear() - release.getFullYear()) * 12 +
      (now.getMonth() - release.getMonth()));
    const yearsSinceRelease = Math.floor(monthsTotal / 12);
    const monthsInYear = monthsTotal % 12;
    return new Version(major, this, {
      year: Math.max(now.getFullYear(), release.getFullYear()),
      yearsSinceRelease,
      monthsSinceRelease: MONTH_LETTERS[monthsInYear],
      month: monthsInYear + 1,
      index,
    });
  };
}

const SCHEMES = new Map<string, VersionScheme>();

export class Version {
  constructor(
    public readonly major: number,
    public readonly scheme: VersionScheme,
    public readonly values: Values,
  ) {}

  static register = (scheme: VersionScheme): void => { SCHEMES.set(scheme.letter, scheme); };

  static scheme = (letter: string): VersionScheme | undefined => SCHEMES.get(letter);

  static parse = (version: string): Version => {
    const m = /^(\d+)\.([A-Z])(.+)$/.exec(version.trim());
    if (!m) throw new Error(`Version: cannot parse "${version}"`);
    const [, majorStr, letter, tail] = m;
    const scheme = SCHEMES.get(letter);
    if (!scheme) throw new Error(`Version: unknown scheme letter "${letter}" in "${version}"`);
    return new Version(parseInt(majorStr, 10), scheme, scheme.parse(tail));
  };

  static tryParse = (version: string): Version | null => {
    try { return Version.parse(version); } catch { return null; }
  };

  toString = (): string => `${this.major}.${this.scheme.letter}${this.scheme.format(this.values)}`;

  toSemver = (opts?: { scheme?: boolean }): string => this.scheme.toSemver(this, opts);
}

Version.register(new Standard());
