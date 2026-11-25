/**
 * Parse Laravel/MySQL datetime strings reliably across iOS and Android.
 * API timestamps are UTC. Naive values are treated as UTC; strings with Z
 * or an offset use the native ISO parser.
 */
export function parseApiDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  }

  const str = String(dateStr).trim();
  if (!str) return null;

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(str)) {
    const withZone = new Date(str);
    if (!Number.isNaN(withZone.getTime())) return withZone;
  }

  const mysqlMatch = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/,
  );

  if (mysqlMatch) {
    const [, y, mo, d, h, mi, s = "0"] = mysqlMatch;
    const utc = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    );
    if (!Number.isNaN(utc.getTime())) return utc;
  }

  const iso = str.includes("T") ? str : str.replace(" ", "T");
  const parsed = new Date(iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
