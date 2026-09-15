import { useCallback, useEffect, useState } from "react";
import { OTP_RESEND_SECONDS } from "../constants/otp-config";
import {
  extractOtpRateLimitFromError,
  normalizeOtpRateLimit,
  otpRateLimitCountdownLabel,
} from "../utils/otp-rate-limit";

export { formatOtpCountdown, formatOtpLockCountdown } from "./use-otp-countdown";

export function useOtpResendLimit(initialRateLimit = null) {
  const [limits, setLimits] = useState(() => normalizeOtpRateLimit(initialRateLimit));
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const normalized = normalizeOtpRateLimit(initialRateLimit);
    return normalized.retryAfterSeconds > 0 ? normalized.retryAfterSeconds : OTP_RESEND_SECONDS;
  });

  const applyRateLimit = useCallback((raw) => {
    const normalized = normalizeOtpRateLimit(raw);
    setLimits(normalized);

    if (normalized.retryAfterSeconds > 0) {
      setSecondsLeft(normalized.retryAfterSeconds);
      return;
    }

    if (!normalized.locked) {
      setSecondsLeft(OTP_RESEND_SECONDS);
    }
  }, []);

  const applyRateLimitFromError = useCallback((error) => {
    const extracted = extractOtpRateLimitFromError(error);
    if (!extracted) return false;
    applyRateLimit(extracted);
    return true;
  }, [applyRateLimit]);

  const resetCountdown = useCallback(() => {
    applyRateLimit({
      locked: false,
      lock_type: null,
      retry_after_seconds: OTP_RESEND_SECONDS,
      resends_remaining: limits.resendsRemaining,
      resend_limit: limits.resendLimit,
    });
  }, [applyRateLimit, limits.resendLimit, limits.resendsRemaining]);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;

    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  const isLocked = limits.locked || secondsLeft > 0;
  const canResend = !limits.locked && secondsLeft <= 0;
  const countdownLabel = otpRateLimitCountdownLabel(secondsLeft, { locked: limits.locked });

  return {
    limits,
    secondsLeft,
    canResend,
    isLocked,
    lockType: limits.lockType,
    resendsRemaining: limits.resendsRemaining,
    countdownLabel,
    applyRateLimit,
    applyRateLimitFromError,
    resetCountdown,
  };
}
