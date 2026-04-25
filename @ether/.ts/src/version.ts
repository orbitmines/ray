/**
 * Ether version strings have the shape:
 *
 *   <MAJOR>.<LETTER><...scheme-specific tail...>
 *
 * The letter immediately after the first dot selects a `VersionScheme`; the
 * scheme owns the tail: how to parse it, how to compare two versions, how to
 * format a parsed value back to a string.
 *
 * Today the only published scheme is `E`, used like `0.E2026.0D.0`:
 *   - 2026   year
 *   - 0      years since first release in this scheme
 *   - D      month-of-year (A=January … L=December)
 *   - 0      0-based index of release within that month
 */

/** Parsed components of a version once the scheme has interpreted the tail. */
export type VersionParts = Record<string, number | string>;

export abstract class VersionScheme {
  /** Single uppercase letter that selects this scheme in a version string. */
  abstract readonly letter: string;

  /** Parse the part of the version after `<MAJOR>.<LETTER>`. */
  abstract parse(tail: string): VersionParts;

  /** Format parts back into the tail (the part after `<MAJOR>.<LETTER>`). */
  abstract format(parts: VersionParts): string;

  /** Total order; <0 if a precedes b, 0 if equal, >0 if a follows b. */
  abstract compare(a: VersionParts, b: VersionParts): number;

  /**
   * Render as a SemVer-compatible string. Schemes pick the mapping that gives
   * a stable ordering under SemVer's rules (so consumers like npm / VS Code
   * Marketplace can sort builds correctly).
   *
   * When `opts.scheme` is true, the original Ether tail is appended as a
   * SemVer prerelease tag (`<base>-<LETTER><tail>`) so a round-trip back to
   * the source version is possible by inspection.
   */
  abstract toSemver(parts: VersionParts, major: number, opts?: { scheme?: boolean }): string;
}

const MONTH_LETTERS = 'ABCDEFGHIJKL';

/**
 * The `E` scheme. Tail format: `<YEAR>.<YEAR_SINCE_RELEASE><MONTH>.<INDEX>`.
 *
 *   YEAR                4-digit calendar year
 *   YEAR_SINCE_RELEASE  integer ≥ 0
 *   MONTH               single letter A..L (Jan..Dec)
 *   INDEX               integer ≥ 0
 */
export class EScheme extends VersionScheme {
  readonly letter = 'E';

  parse(tail: string): VersionParts {
    const m = /^(\d+)\.(\d+)([A-L])\.(\d+)$/.exec(tail);
    if (!m) throw new Error(`E-scheme: cannot parse tail "${tail}"`);
    const [, year, yearsSinceRelease, monthLetter, index] = m;
    return {
      year: parseInt(year, 10),
      yearsSinceRelease: parseInt(yearsSinceRelease, 10),
      monthLetter,
      month: MONTH_LETTERS.indexOf(monthLetter) + 1,   // 1..12
      index: parseInt(index, 10),
    };
  }

  format(p: VersionParts): string {
    return `${p.year}.${p.yearsSinceRelease}${p.monthLetter}.${p.index}`;
  }

  compare(a: VersionParts, b: VersionParts): number {
    return (
      (a.year as number)              - (b.year as number)
      || (a.yearsSinceRelease as number) - (b.yearsSinceRelease as number)
      || (a.month as number)          - (b.month as number)
      || (a.index as number)          - (b.index as number)
    );
  }

  /**
   * SemVer mapping: `<MAJOR>.<YEAR_SINCE_RELEASE * 12 + MONTH>.<INDEX>`.
   *
   *   - SemVer major  ← Ether major (the digit before the first dot).
   *   - SemVer minor  ← total months since the year-zero release. Monotonic
   *                     across years, so 5y/Mar (5*12+3=63) sorts after
   *                     0y/Dec (0*12+12=12) without ever colliding.
   *   - SemVer patch  ← release index within that month.
   *
   * This is lossy — the calendar `year` (e.g. 2026) is dropped. Pass
   * `{ scheme: true }` to retain it: the full Ether tail is appended as a
   * prerelease tag, e.g. `0.4.0-E2026.0D.0`.
   */
  toSemver(parts: VersionParts, major: number, opts?: { scheme?: boolean }): string {
    const ysr   = parts.yearsSinceRelease as number;
    const month = parts.month as number;
    const idx   = parts.index as number;
    const base  = `${major}.${ysr * 12 + month}.${idx}`;
    if (!opts?.scheme) return base;
    return `${base}-${this.letter}${this.format(parts)}`;
  }
}

/**
 * Registry of known schemes, keyed by their letter. Extra schemes can be
 * registered with `Version.register(new MyScheme())`.
 */
const SCHEMES = new Map<string, VersionScheme>();

export class Version {
  constructor(
    public readonly major: number,
    public readonly scheme: VersionScheme,
    public readonly parts: VersionParts,
  ) {}

  /** Register a scheme so `Version.parse` can recognise its letter. */
  static register(scheme: VersionScheme): void {
    SCHEMES.set(scheme.letter, scheme);
  }

  /** Look up a registered scheme by its letter, or undefined if not registered. */
  static scheme(letter: string): VersionScheme | undefined {
    return SCHEMES.get(letter);
  }

  /**
   * Parse `<MAJOR>.<LETTER><tail>`. Throws if the major isn't a number, the
   * scheme letter isn't registered, or the scheme rejects the tail.
   */
  static parse(version: string): Version {
    const m = /^(\d+)\.([A-Z])(.+)$/.exec(version.trim());
    if (!m) throw new Error(`Version: cannot parse "${version}"`);
    const [, majorStr, letter, tail] = m;
    const scheme = SCHEMES.get(letter);
    if (!scheme) throw new Error(`Version: unknown scheme letter "${letter}" in "${version}"`);
    return new Version(parseInt(majorStr, 10), scheme, scheme.parse(tail));
  }

  /** Same as `parse` but returns null instead of throwing. */
  static tryParse(version: string): Version | null {
    try { return Version.parse(version); } catch { return null; }
  }

  toString(): string {
    return `${this.major}.${this.scheme.letter}${this.scheme.format(this.parts)}`;
  }

  /** Render as SemVer. See `VersionScheme.toSemver`. */
  toSemver(opts?: { scheme?: boolean }): string {
    return this.scheme.toSemver(this.parts, this.major, opts);
  }

  /**
   * Compare two versions. Versions in different schemes can't be ordered, so
   * the caller gets `null`; otherwise major is compared first, then the
   * scheme's tail compare.
   */
  compare(other: Version): number | null {
    if (this.scheme !== other.scheme) return null;
    return (this.major - other.major) || this.scheme.compare(this.parts, other.parts);
  }
}

// Built-in schemes — register on module load so callers don't have to.
Version.register(new EScheme());
