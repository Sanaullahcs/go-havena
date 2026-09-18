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
    if (initialRateLimit == null) return OTP_RESEND_SECONDS;
    return normalizeOtpRateLimit(initialRateLimit).retryAfterSeconds;
  });

  const applyRateLimit = useCallback((raw: unknown) => {
    const normalized = normalizeOtpRateLimit(raw);
    setLimits(normalized);

    if (normalized.retryAfterSeconds > 0) {
      setSecondsLeft(normalized.retryAfterSeconds);
      return;
    }

    if (!normalized.locked) {
      setSecondsLeft(raw == null ? OTP_RESEND_SECONDS : 0);
    }
  }, []);

  const applyRateLimitFromError = useCallback(
    (error: unknown) => {
      const extracted = extractOtpRateLimitFromError(error);
      if (!extracted) return false;
      applyRateLimit(extracted);
      return true;
    },
    [applyRateLimit],
  );

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (limits.locked && limits.lockType === "resend_limit") {
        setLimits((current) => ({
          ...current,
          locked: false,
          lockType: null,
          retryAfterSeconds: 0,
        }));
      }
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [secondsLeft, limits.locked, limits.lockType]);

  const canResend = !limits.locked && secondsLeft <= 0;
  const countdownLabel = otpRateLimitCountdownLabel(secondsLeft, {
    locked: limits.locked,
    lockType: limits.lockType,
  });

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
