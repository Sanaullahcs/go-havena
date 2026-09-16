import { useCallback, useEffect, useRef, useState } from "react";
import { OTP_RESEND_LOCK_MINUTES, OTP_RESEND_SECONDS } from "../constants/otp-config";
import i18n from "../i18n";
import {
  extractOtpRateLimitFromError,
  normalizeOtpRateLimit,
  otpRateLimitCountdownLabel,
} from "../utils/otp-rate-limit";

export { formatOtpCountdown, formatOtpLockCountdown } from "./use-otp-countdown";

function isResendLimitLock(normalized) {
  return Boolean(normalized?.locked && normalized?.lockType === "resend_limit");
}

export function useOtpResendLimit(initialRateLimit = null, { dialog } = {}) {
  const [limits, setLimits] = useState(() => normalizeOtpRateLimit(initialRateLimit));
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const normalized = normalizeOtpRateLimit(initialRateLimit);
    return normalized.retryAfterSeconds > 0 ? normalized.retryAfterSeconds : OTP_RESEND_SECONDS;
  });
  const resendLimitDialogShownRef = useRef(false);

  const maybeShowResendLimitDialog = useCallback(
    (normalized) => {
      if (
        !dialog ||
        resendLimitDialogShownRef.current ||
        !isResendLimitLock(normalized)
      ) {
        return;
      }

      resendLimitDialogShownRef.current = true;
      void dialog.showError(
        i18n.t("auth.tooManyCodeRequests"),
        i18n.t("auth.otpResendLockMessage", { minutes: OTP_RESEND_LOCK_MINUTES }),
      );
    },
    [dialog],
  );

  const applyRateLimit = useCallback(
    (raw) => {
      const normalized = normalizeOtpRateLimit(raw);
      setLimits(normalized);

      if (normalized.retryAfterSeconds > 0) {
        setSecondsLeft(normalized.retryAfterSeconds);
      } else if (!normalized.locked) {
        setSecondsLeft(OTP_RESEND_SECONDS);
      }

      maybeShowResendLimitDialog(normalized);
      return normalized;
    },
    [maybeShowResendLimitDialog],
  );

  const applyRateLimitFromError = useCallback(
    (error) => {
      const extracted = extractOtpRateLimitFromError(error);
      if (!extracted) return false;
      applyRateLimit(extracted);
      return true;
    },
    [applyRateLimit],
  );

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
    if (secondsLeft <= 0) {
      if (limits.locked && limits.lockType === "resend_limit") {
        setLimits((current) => ({
          ...current,
          locked: false,
          lockType: null,
          retryAfterSeconds: 0,
        }));
        resendLimitDialogShownRef.current = false;
      }
      return undefined;
    }

    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft, limits.locked, limits.lockType]);

  const isResendLimitLockActive = isResendLimitLock(limits);
  const canResend = !limits.locked && secondsLeft <= 0;
  const countdownLabel = otpRateLimitCountdownLabel(secondsLeft, {
    locked: limits.locked,
    lockType: limits.lockType,
  });

  return {
    limits,
    secondsLeft,
    canResend,
    isLocked: limits.locked || secondsLeft > 0,
    isResendLimitLock: isResendLimitLockActive,
    lockType: limits.lockType,
    resendsRemaining: limits.resendsRemaining,
    countdownLabel,
    applyRateLimit,
    applyRateLimitFromError,
    resetCountdown,
  };
}
