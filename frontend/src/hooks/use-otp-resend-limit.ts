"use client";

import { useCallback, useEffect, useState } from "react";
import {
  normalizeOtpRateLimit,
  extractOtpRateLimitFromError,
  otpRateLimitCountdownLabel,
  type OtpRateLimitState,
} from "@/lib/auth/otp-rate-limit";
import { OTP_RESEND_LOCK_SECONDS, OTP_RESEND_SECONDS } from "@/lib/auth/otp-config";

function initialSecondsLeft(initialRateLimit: unknown): number {
  const normalized = normalizeOtpRateLimit(initialRateLimit);
  return normalized.retryAfterSeconds > 0 ? normalized.retryAfterSeconds : OTP_RESEND_SECONDS;
}

export function useOtpResendLimit(initialRateLimit: unknown = null) {
  const [limits, setLimits] = useState<OtpRateLimitState>(() =>
    normalizeOtpRateLimit(initialRateLimit),
  );
  const [secondsLeft, setSecondsLeft] = useState(() => initialSecondsLeft(initialRateLimit));

  const applyRateLimit = useCallback(
    (raw: unknown, options?: { extendCooldown?: boolean }) => {
      const normalized = normalizeOtpRateLimit(raw);
      setLimits(normalized);

      let retrySeconds = normalized.retryAfterSeconds;
      if (retrySeconds <= 0 && normalized.locked) {
        if (normalized.lockType === "resend_limit") {
          retrySeconds = OTP_RESEND_LOCK_SECONDS;
        } else if (normalized.lockType === "security") {
          retrySeconds = OTP_RESEND_LOCK_SECONDS;
        }
      }

      if (retrySeconds > 0) {
        setSecondsLeft((current) =>
          options?.extendCooldown ? Math.max(current, retrySeconds) : retrySeconds,
        );
        return;
      }

      // Demo / bypass emails return retry_after 0 — still enforce the 1-minute UX cooldown.
      if (!normalized.locked) {
        setSecondsLeft((current) =>
          options?.extendCooldown ? Math.max(current, OTP_RESEND_SECONDS) : OTP_RESEND_SECONDS,
        );
      }
    },
    [],
  );

  const applyRateLimitFromError = useCallback(
    (error: unknown) => {
      const extracted = extractOtpRateLimitFromError(error);
      if (!extracted) return false;
      const code =
        error instanceof Error
          ? (error as Error & { code?: string }).code
          : undefined;
      const extendCooldown = code === "INVALID_OTP" || code === "OTP_VERIFY_LOCKED";
      applyRateLimit(extracted, { extendCooldown });
      return true;
    },
    [applyRateLimit],
  );

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (limits.locked && (limits.lockType === "resend_limit" || limits.lockType === "security")) {
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
