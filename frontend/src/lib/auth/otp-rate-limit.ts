import { formatOtpCountdown, formatOtpLockCountdown } from "@/lib/auth/otp-config";

export type OtpRateLimitState = {
  locked: boolean;
  lockType: "security" | "resend_limit" | null;
  retryAfterSeconds: number;
  resendsRemaining: number | null;
  resendLimit: number | null;
};

export function normalizeOtpRateLimit(raw: unknown): OtpRateLimitState {
  if (!raw || typeof raw !== "object") {
    return {
      locked: false,
      lockType: null,
      retryAfterSeconds: 0,
      resendsRemaining: null,
      resendLimit: null,
    };
  }

  const record = raw as Record<string, unknown>;
  const lockTypeRaw = record.lock_type ?? record.lockType;
  const lockType =
    lockTypeRaw === "security" || lockTypeRaw === "resend_limit" ? lockTypeRaw : null;

  return {
    locked: Boolean(record.locked),
    lockType,
    retryAfterSeconds: Math.max(
      0,
      Number(
        record.retry_after_seconds ??
          record.retryAfterSeconds ??
          record.resend_cooldown_seconds ??
          record.resendCooldownSeconds ??
          0,
      ),
    ),
    resendsRemaining:
      record.resends_remaining === undefined || record.resends_remaining === null
        ? null
        : Number(record.resends_remaining),
    resendLimit: record.resend_limit === undefined ? null : Number(record.resend_limit),
  };
}

export function extractOtpRateLimitFromError(err: unknown): OtpRateLimitState | null {
  if (!(err instanceof Error)) return null;

  const apiErr = err as {
    code?: string;
    retryAfterSeconds?: number;
    rateLimit?: unknown;
  };

  if (apiErr.code === "OTP_MAIL_FAILED") {
    return null;
  }

  if (apiErr.rateLimit) {
    const normalized = normalizeOtpRateLimit(apiErr.rateLimit);
    if (!normalized.lockType && apiErr.code === "OTP_RESEND_LOCKED") {
      return { ...normalized, locked: true, lockType: "resend_limit" };
    }
    if (!normalized.lockType && apiErr.code === "OTP_VERIFY_LOCKED") {
      return { ...normalized, locked: true, lockType: "security" };
    }
    return normalized;
  }

  const retryAfter = Number(apiErr.retryAfterSeconds ?? 0);
  if (
    apiErr.code !== "OTP_COOLDOWN" &&
    apiErr.code !== "OTP_RESEND_LOCKED" &&
    apiErr.code !== "OTP_VERIFY_LOCKED"
  ) {
    return null;
  }

  const lockType =
    apiErr.code === "OTP_VERIFY_LOCKED"
      ? "security"
      : apiErr.code === "OTP_RESEND_LOCKED"
        ? "resend_limit"
        : null;

  return normalizeOtpRateLimit({
    locked: Boolean(lockType),
    lock_type: lockType,
    retry_after_seconds: retryAfter,
  });
}

export function otpRateLimitCountdownLabel(
  seconds: number,
  options: { locked?: boolean; lockType?: OtpRateLimitState["lockType"] } = {},
): string {
  const { locked = false, lockType = null } = options;

  if (lockType === "resend_limit") {
    return formatOtpCountdown(seconds);
  }

  if (seconds >= 3600 || (locked && seconds >= 600)) {
    return formatOtpLockCountdown(seconds);
  }

  return formatOtpCountdown(seconds);
}
