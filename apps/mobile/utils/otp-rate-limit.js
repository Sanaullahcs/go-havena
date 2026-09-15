import { formatOtpCountdown, formatOtpLockCountdown } from "../hooks/use-otp-countdown";

export function normalizeOtpRateLimit(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      locked: false,
      lockType: null,
      retryAfterSeconds: 0,
      resendsRemaining: null,
      resendLimit: null,
    };
  }

  return {
    locked: Boolean(raw.locked),
    lockType: raw.lock_type ?? null,
    retryAfterSeconds: Math.max(0, Number(raw.retry_after_seconds ?? raw.resend_cooldown_seconds ?? 0)),
    resendsRemaining:
      raw.resends_remaining === undefined || raw.resends_remaining === null
        ? null
        : Number(raw.resends_remaining),
    resendLimit: raw.resend_limit === undefined ? null : Number(raw.resend_limit),
  };
}

export function extractOtpRateLimitFromResponse(body) {
  const rateLimit = body?.data?.rate_limit ?? body?.rate_limit ?? null;
  return rateLimit ? normalizeOtpRateLimit(rateLimit) : null;
}

export function extractOtpRateLimitFromError(error) {
  if (error?.rateLimit) {
    return normalizeOtpRateLimit(error.rateLimit);
  }

  const retryAfter = Number(error?.retryAfterSeconds ?? 0);
  if (!retryAfter && !error?.code?.startsWith?.("OTP_")) {
    return null;
  }

  const lockType =
    error?.code === "OTP_VERIFY_LOCKED"
      ? "security"
      : error?.code === "OTP_RESEND_LOCKED"
        ? "resend_limit"
        : null;

  return normalizeOtpRateLimit({
    locked: Boolean(lockType),
    lock_type: lockType,
    retry_after_seconds: retryAfter,
    resends_remaining: error?.rateLimit?.resends_remaining,
    resend_limit: error?.rateLimit?.resend_limit,
  });
}

export function isOtpRateLimitError(code) {
  return code === "OTP_COOLDOWN" || code === "OTP_RESEND_LOCKED" || code === "OTP_VERIFY_LOCKED";
}

export function otpRateLimitCountdownLabel(seconds, { locked = false } = {}) {
  if (seconds >= 3600 || (locked && seconds >= 600)) {
    return formatOtpLockCountdown(seconds);
  }

  return formatOtpCountdown(seconds);
}
