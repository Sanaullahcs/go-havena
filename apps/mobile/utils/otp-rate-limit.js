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

  const lockTypeRaw = raw.lock_type ?? raw.lockType;
  const lockType =
    lockTypeRaw === "security" || lockTypeRaw === "resend_limit" ? lockTypeRaw : null;

  return {
    locked: Boolean(raw.locked),
    lockType,
    retryAfterSeconds: Math.max(
      0,
      Number(
        raw.retry_after_seconds ??
          raw.retryAfterSeconds ??
          raw.resend_cooldown_seconds ??
          raw.resendCooldownSeconds ??
          0,
      ),
    ),
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
    const normalized = normalizeOtpRateLimit(error.rateLimit);
    if (!normalized.lockType && error?.code === "OTP_RESEND_LOCKED") {
      return { ...normalized, locked: true, lockType: "resend_limit" };
    }
    if (!normalized.lockType && error?.code === "OTP_VERIFY_LOCKED") {
      return { ...normalized, locked: true, lockType: "security" };
    }
    return normalized;
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

/** Matches Laravel `OtpRateLimitService::formatDuration` for consistent web/mobile copy. */
export function formatOtpWaitDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (safe >= 3600) {
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (safe >= 60) {
    const minutes = Math.floor(safe / 60);
    const remain = safe % 60;
    return remain > 0 ? `${minutes}m ${remain}s` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${safe}s`;
}

export function resolveOtpRateLimitMessage(t, { lockType = null, secondsLeft = 0, code = null } = {}) {
  const time = formatOtpWaitDuration(secondsLeft);
  if (lockType === "security" || code === "OTP_VERIFY_LOCKED") {
    return t("auth.otpVerifyLockedCountdown", { time });
  }
  if (lockType === "resend_limit" || code === "OTP_RESEND_LOCKED") {
    return t("auth.otpResendLockedCountdown", { time });
  }
  return t("auth.otpCooldownCountdown", { time });
}

export function otpRateLimitCountdownLabel(seconds, { locked = false, lockType = null } = {}) {
  if (lockType === "resend_limit") {
    return formatOtpCountdown(seconds);
  }

  if (seconds >= 3600 || (locked && seconds >= 600)) {
    return formatOtpLockCountdown(seconds);
  }

  return formatOtpCountdown(seconds);
}
