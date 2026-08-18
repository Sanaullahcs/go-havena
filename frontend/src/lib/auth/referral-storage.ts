const REFERRAL_STORAGE_KEY = "havena_referral_code";
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

/**
 * Extract a clean referral code from raw query values, pasted URLs, or corrupted strings.
 * Examples handled:
 * - "9OD7ELGR"
 * - "http://localhost:3000/register?ref=9OD7ELGR"
 * - "9OD7ELGRhttp://localhost:3000/register?ref=9OD7ELGR"
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  // Prefer an explicit ?ref= / &ref= value if present (covers pasted/full URLs).
  const fromQuery = input.match(/[?&]ref=([^&#\s]+)/i);
  if (fromQuery?.[1]) {
    try {
      const decoded = decodeURIComponent(fromQuery[1]).trim().toUpperCase();
      const cleaned = decoded.replace(/[^A-Z0-9]/g, "");
      if (REFERRAL_CODE_PATTERN.test(cleaned)) return cleaned;
    } catch {
      /* fall through */
    }
  }

  const upper = input.toUpperCase();

  // If a URL was glued after a code, take the leading alphanumeric segment.
  const leading = upper.match(/^([A-Z0-9]{4,16})(?:HTTPS?:\/\/|\s|$)/);
  if (leading?.[1] && REFERRAL_CODE_PATTERN.test(leading[1])) {
    return leading[1];
  }

  const cleaned = upper.replace(/[^A-Z0-9]/g, "");
  if (REFERRAL_CODE_PATTERN.test(cleaned)) return cleaned;

  return null;
}

export function isValidReferralCode(raw: string | null | undefined): boolean {
  return normalizeReferralCode(raw) !== null;
}

export function persistReferralCode(code: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeReferralCode(code);
  if (!normalized) {
    sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
}

export function readPersistedReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  const stored = normalizeReferralCode(sessionStorage.getItem(REFERRAL_STORAGE_KEY));
  if (!stored) {
    sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
    return null;
  }
  return stored;
}

export function clearPersistedReferralCode(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
}
