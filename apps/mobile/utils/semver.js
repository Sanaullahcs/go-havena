/**
 * Semantic version helpers (numeric segments only).
 * 1.0.10 > 1.0.9 — never compare version strings lexicographically.
 */

export function parseSemver(version) {
  const cleaned = String(version ?? "")
    .trim()
    .replace(/[^0-9.]/g, "");
  if (!cleaned) return [0];
  return cleaned.split(".").map((part) => {
    const n = parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** @returns {number} negative if a < b, 0 if equal, positive if a > b */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

export function isSemverLessThan(a, b) {
  return compareSemver(a, b) < 0;
}

export function isSemverGreaterOrEqual(a, b) {
  return compareSemver(a, b) >= 0;
}
