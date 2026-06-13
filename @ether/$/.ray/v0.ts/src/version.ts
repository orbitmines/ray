
/**
 * Ether's calendar version, the `E` scheme:
 *   `<major>.E<year>.<yearsSinceRelease><monthLetter>.<index>`  e.g. `0.E2026.0D.0`
 * Its semver form drops the scheme: `<major>.<yearsSinceRelease*12 + month>.<index>`
 * (`0.4.0`), optionally re-suffixed with `-E<...>` (`0.4.0-E2026.0D.0`).
 *
 * Folded into one class — the scheme is fixed, not pluggable.
 */
export class Version {
  static readonly letter = 'E';

  static MONTH_LETTERS = 'ABCDEFGHIJKL';

  constructor(
    public readonly major: number,
    public readonly year: number,
    public readonly yearsSinceRelease: number,
    public readonly month: number,           // 1–12
    public readonly index: number,
  ) {}

  get monthLetter(): string { return Version.MONTH_LETTERS[this.month - 1]; }
  private get tail(): string { return `${this.year}.${this.yearsSinceRelease}${this.monthLetter}.${this.index}`; }

  /** `<major>.E<tail>` — the form `parse` reads back. */
  toString(): string { return `${this.major}.${Version.letter}${this.tail}`; }

  /** Semver `<major>.<minor>.<patch>`; with `scheme`, re-suffixed `-E<tail>`. */
  toSemver(opts?: { scheme?: boolean }): string {
    const base = `${this.major}.${this.yearsSinceRelease * 12 + this.month}.${this.index}`;
    return opts?.scheme ? `${base}-${Version.letter}${this.tail}` : base;
  }

  static parse(version: string): Version {
    const m = /^(\d+)\.E(\d+)\.(\d+)([A-L])\.(\d+)$/.exec(version.trim());
    if (!m) throw new Error(`Version: cannot parse "${version}"`);
    const [, major, year, yearsSinceRelease, monthLetter, index] = m;
    return new Version(+major, +year, +yearsSinceRelease, Version.MONTH_LETTERS.indexOf(monthLetter) + 1, +index);
  }

  static tryParse(version: string): Version | null {
    try { return Version.parse(version); } catch { return null; }
  }

  /** Derive a version from a release date + index — the calendar fields fill
   *  from the years/months elapsed since release. */
  static create(major: number, releaseDate: string, index: number): Version {
    const release = new Date(releaseDate);
    const now = new Date();
    const monthsTotal = Math.max(0,
      (now.getFullYear() - release.getFullYear()) * 12 + (now.getMonth() - release.getMonth()));
    return new Version(
      major,
      Math.max(now.getFullYear(), release.getFullYear()),
      Math.floor(monthsTotal / 12),
      monthsTotal % 12 + 1,
      index,
    );
  }
}
