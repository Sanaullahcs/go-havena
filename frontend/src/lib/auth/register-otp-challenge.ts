import { normalizeOtpRateLimit } from "@/lib/auth/otp-rate-limit";

export const REGISTER_OTP_CHALLENGE_KEY = "havena_ca_register_otp";
export const REGISTER_OTP_COOKIE_NAME = "havena_ca_register_otp";

export type PersistedRegisterOtpChallenge = {
  email: string;
  intent: "signup";
  expiresAt?: string | null;
  resendAvailableAt?: string | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function normalizeChallenge(raw: unknown): PersistedRegisterOtpChallenge | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (!email || record.intent !== "signup") return null;
  if ("code" in record || "otp" in record) return null;

  return {
    email,
    intent: "signup",
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : null,
    resendAvailableAt: typeof record.resendAvailableAt === "string" ? record.resendAvailableAt : null,
  };
}

export function isPersistedChallengeFresh(
  challenge: PersistedRegisterOtpChallenge,
  now = Date.now(),
): boolean {
  if (!challenge.expiresAt) return false;
  const expires = Date.parse(challenge.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

function challengeMaxAgeSeconds(challenge: PersistedRegisterOtpChallenge, now = Date.now()): number {
  if (!challenge.expiresAt) return 0;
  const expires = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, Math.ceil((expires - now) / 1000));
}

function writeRegisterOtpCookie(challenge: PersistedRegisterOtpChallenge | null): void {
  if (typeof document === "undefined") return;
  if (!challenge || !isPersistedChallengeFresh(challenge)) {
    document.cookie = `${REGISTER_OTP_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  const maxAge = challengeMaxAgeSeconds(challenge);
  document.cookie = `${REGISTER_OTP_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(challenge))}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function shouldSyncCookie(storage: StorageLike | null): boolean {
  return typeof window !== "undefined" && storage === window.sessionStorage;
}

export function parseRegisterOtpChallengeCookie(
  raw: string | null | undefined,
  now = Date.now(),
): PersistedRegisterOtpChallenge | null {
  if (!raw) return null;
  try {
    const decoded = raw.includes("%") ? decodeURIComponent(raw) : raw;
    const parsed = normalizeChallenge(JSON.parse(decoded));
    if (!parsed || !isPersistedChallengeFresh(parsed, now)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistRegisterOtpChallenge(
  challenge: PersistedRegisterOtpChallenge,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const normalized = normalizeChallenge(challenge);
  if (!normalized || !isPersistedChallengeFresh(normalized)) {
    storage.removeItem(REGISTER_OTP_CHALLENGE_KEY);
    if (shouldSyncCookie(storage)) writeRegisterOtpCookie(null);
    return;
  }
  storage.setItem(REGISTER_OTP_CHALLENGE_KEY, JSON.stringify(normalized));
  if (shouldSyncCookie(storage)) writeRegisterOtpCookie(normalized);
}

export function readRegisterOtpChallenge(
  storage: StorageLike | null = defaultStorage(),
  now = Date.now(),
): PersistedRegisterOtpChallenge | null {
  if (!storage) return null;
  try {
    const parsed = normalizeChallenge(JSON.parse(storage.getItem(REGISTER_OTP_CHALLENGE_KEY) ?? "null"));
    if (!parsed || !isPersistedChallengeFresh(parsed, now)) {
      storage.removeItem(REGISTER_OTP_CHALLENGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(REGISTER_OTP_CHALLENGE_KEY);
    return null;
  }
}

export function clearRegisterOtpChallenge(storage: StorageLike | null = defaultStorage()): void {
  storage?.removeItem(REGISTER_OTP_CHALLENGE_KEY);
  if (shouldSyncCookie(storage)) writeRegisterOtpCookie(null);
}

export function resendAvailableAtFromRateLimit(rateLimit: unknown, now = Date.now()): string {
  const retryAfterSeconds = normalizeOtpRateLimit(rateLimit).retryAfterSeconds;
  return new Date(now + Math.max(0, retryAfterSeconds) * 1000).toISOString();
}

export function rateLimitFromPersistedChallenge(
  challenge: PersistedRegisterOtpChallenge,
  now = Date.now(),
): { locked: false; lock_type: null; retry_after_seconds: number } {
  const until = challenge.resendAvailableAt ? Date.parse(challenge.resendAvailableAt) : NaN;
  const retryAfterSeconds = Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;

  return {
    locked: false,
    lock_type: null,
    retry_after_seconds: retryAfterSeconds,
  };
}
