/** OTP timing — aligned with mobile `apps/mobile/constants/otp-config.js` + backend `otp.expire_minutes`. */
export const OTP_EXPIRE_MINUTES = 5;
export const OTP_EXPIRE_SECONDS = OTP_EXPIRE_MINUTES * 60;
export const OTP_RESEND_SECONDS = 60;
/** Lockout after max resends — aligned with backend `otp.resend_lock_seconds` (900). */
export const OTP_RESEND_LOCK_SECONDS = 900;
export const OTP_RESEND_LOCK_MINUTES = OTP_RESEND_LOCK_SECONDS / 60;

/** Prefer server-relative remaining seconds; never show longer than the configured window. */
export function clampOtpExpirySeconds(seconds: number | null | undefined): number | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return Math.max(0, Math.min(OTP_EXPIRE_SECONDS, Math.ceil(seconds)));
}

export function formatOtpCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function otpResendLockUserMessage(seconds?: number | null): string {
  if (seconds != null && Number.isFinite(seconds) && seconds > 0) {
    return `Too many code requests. Please try again in ${formatOtpCountdown(Math.ceil(seconds))}.`;
  }
  return `Too many code requests. Please try again in ${OTP_RESEND_LOCK_MINUTES} minutes.`;
}

export function formatOtpLockCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return formatOtpCountdown(safe);
}
