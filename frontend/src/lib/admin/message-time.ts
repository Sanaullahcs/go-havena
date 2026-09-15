/**
 * Parse Laravel/MySQL datetime strings reliably in the browser.
 * API timestamps are UTC (APP_TIMEZONE=UTC). Naive values are treated as UTC;
 * strings with Z / ±offset use the native ISO parser.
 */
export function parseApiDateTime(value?: string | null): Date | null {
  if (!value) return null;

  const str = String(value).trim();
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
  const parsed = new Date(
    iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatConversationTime(iso?: string | null): string {
  const date = parseApiDateTime(iso);
  if (!date) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)}h`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatMessageTime(iso?: string | null): string {
  const date = parseApiDateTime(iso);
  if (!date) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
