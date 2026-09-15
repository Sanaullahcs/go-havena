"use client";

import { useCallback, useEffect, useState } from "react";
import {
  normalizeOtpRateLimit,
  extractOtpRateLimitFromError,
  otpRateLimitCountdownLabel,
  type OtpRateLimitState,
} from "@/lib/auth/otp-rate-limit";
import { OTP_RESEND_SECONDS } from "@/lib/auth/otp-config";

export function useOtpResendLimit(initialRateLimit: unknown = null) {
  const [limits, setLimits] = useState<OtpRateLimitState>(() =>
    normalizeOtpRateLimit(initialRateLimit),
  );
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const normalized = normalizeOtpRateLimit(initialRateLimit);
    return normalized.retryAfterSeconds > 0 ? normalized.retryAfterSeconds : OTP_RESEND_SECONDS;
  });

  const applyRateLimit = useCallback((raw: unknown) => {
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

  const applyRateLimitFromError = useCallback((error: unknown) => {
    const extracted = extractOtpRateLimitFromError(error);
    if (!extracted) return false;
    applyRateLimit(extracted);
    return true;
  }, [applyRateLimit]);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const canResend = !limits.locked && secondsLeft <= 0;
  const countdownLabel = otpRateLimitCountdownLabel(secondsLeft, limits.locked);

  return {
    limits,
    secondsLeft,
    canResend,
    lockType: limits.lockType,
    countdownLabel,
    applyRateLimit,
    applyRateLimitFromError,
  };
}
