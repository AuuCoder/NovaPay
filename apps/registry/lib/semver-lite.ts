/**
 * Minimal semver utilities (no external dependencies).
 *
 * Supports basic MAJOR.MINOR.PATCH comparison. Does not handle pre-release
 * tags or build metadata — sufficient for plugin version ordering in phase 2.
 */

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

export function valid(version: string): boolean {
  return SEMVER_REGEX.test(version.trim());
}

export function parse(version: string): [number, number, number] | null {
  const match = version.trim().match(SEMVER_REGEX);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Returns:
 *  - negative if a < b
 *  - 0 if a === b
 *  - positive if a > b
 *
 * Throws if either version is not valid semver.
 */
export function compare(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa) throw new Error(`Invalid semver: ${a}`);
  if (!pb) throw new Error(`Invalid semver: ${b}`);

  for (let i = 0; i < 3; i++) {
    const diff = pa[i]! - pb[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}
