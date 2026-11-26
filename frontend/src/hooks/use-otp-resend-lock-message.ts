"use client";

import { useCallback, useEffect, useState } from "react";
import {
  OTP_RESEND_LOCK_SECONDS,
  otpResendLockUserMessage,
} from "@/lib/auth/otp-config";
import { normalizeOtpRateLimit } from "@/lib/auth/otp-rate-limit";
import { ApiError } from "@/lib/api/client";

/** Resolve remaining lock seconds from an OTP resend-lock API error. */
export function resolveOtpResendLockSeconds(err: unknown): number {
  if (err instanceof ApiError) {
    const limits = normalizeOtpRateLimit(err.rateLimit);
    if (limits.retryAfterSeconds > 0) return Math.ceil(limits.retryAfterSeconds);
    const topLevel = Number(err.retryAfterSeconds ?? 0);
    if (topLevel > 0) return Math.ceil(topLevel);
  }
  return OTP_RESEND_LOCK_SECONDS;
}

/**
 * Live banner countdown for OTP_RESEND_LOCKED — same MM:SS style as mobile.
 * `lockMessage` updates every second while locked; null when not locked.
 */
export function useOtpResendLockMessage() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const startResendLock = useCallback((seconds?: number | null) => {
    const next = Math.max(
      0,
      Math.ceil(Number(seconds) > 0 ? Number(seconds) : OTP_RESEND_LOCK_SECONDS),
    );
    setSecondsLeft(next);
  }, []);

  const clearResendLock = useCallback(() => {
    setSecondsLeft(0);
  }, []);

  const startResendLockFromError = useCallback(
    (err: unknown) => {
      startResendLock(resolveOtpResendLockSeconds(err));
    },
    [startResendLock],
  );

  return {
    secondsLeft,
    isResendLocked: secondsLeft > 0,
    lockMessage: secondsLeft > 0 ? otpResendLockUserMessage(secondsLeft) : null,
    startResendLock,
    startResendLockFromError,
    clearResendLock,
  };
}
