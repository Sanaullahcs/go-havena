import { useCallback, useEffect, useRef, useState } from "react";
import {
  OTP_RESEND_LOCK_SECONDS,
  OTP_RESEND_SECONDS,
} from "../constants/otp-config";
import {
  extractOtpRateLimitFromError,
  normalizeOtpRateLimit,
  otpRateLimitCountdownLabel,
} from "../utils/otp-rate-limit";

export { formatOtpCountdown, formatOtpLockCountdown } from "./use-otp-countdown";

function isResendLimitLock(normalized) {
  return Boolean(normalized?.locked && normalized?.lockType === "resend_limit");
}

function initialSecondsLeft(initialRateLimit, { startAtZero = false } = {}) {
  const normalized = normalizeOtpRateLimit(initialRateLimit);
  if (normalized.retryAfterSeconds > 0) {
    return normalized.retryAfterSeconds;
  }
  return startAtZero ? 0 : OTP_RESEND_SECONDS;
}

export function useOtpResendLimit(
  initialRateLimit = null,
  { startAtZero = false, showResendLimitDialog = true } = {},
) {
  const [limits, setLimits] = useState(() => normalizeOtpRateLimit(initialRateLimit));
  const [secondsLeft, setSecondsLeft] = useState(() =>
    initialSecondsLeft(initialRateLimit, { startAtZero }),
  );
  const [lastOtpErrorCode, setLastOtpErrorCode] = useState(null);
  const [resendLimitDialogVisible, setResendLimitDialogVisible] = useState(false);
  const resendLimitDialogShownRef = useRef(false);

  const applyRateLimit = useCallback(
    (raw, options = {}) => {
      const normalized = normalizeOtpRateLimit(raw);
      setLimits(normalized);
      const extendCooldown = Boolean(options.extendCooldown);

      let retrySeconds = normalized.retryAfterSeconds;
      if (retrySeconds <= 0 && normalized.locked) {
        if (normalized.lockType === "resend_limit" || normalized.lockType === "security") {
          retrySeconds = OTP_RESEND_LOCK_SECONDS;
        }
      }

      if (retrySeconds > 0) {
        setSecondsLeft((current) =>
          extendCooldown ? Math.max(current, retrySeconds) : retrySeconds,
        );
      } else if (!normalized.locked) {
        setSecondsLeft((current) =>
          extendCooldown ? Math.max(current, OTP_RESEND_SECONDS) : OTP_RESEND_SECONDS,
        );
      }

      if (
        showResendLimitDialog &&
        isResendLimitLock(normalized) &&
        !resendLimitDialogShownRef.current
      ) {
        resendLimitDialogShownRef.current = true;
        setResendLimitDialogVisible(true);
      }

      return normalized;
    },
    [showResendLimitDialog],
  );

  const applyRateLimitFromError = useCallback(
    (error) => {
      const extracted = extractOtpRateLimitFromError(error);
      if (!extracted) return false;
      const code = error?.code;
      if (code === "OTP_COOLDOWN" || code === "OTP_RESEND_LOCKED" || code === "OTP_VERIFY_LOCKED") {
        setLastOtpErrorCode(code);
      }
      const extendCooldown = code === "INVALID_OTP" || code === "OTP_VERIFY_LOCKED";
      applyRateLimit(extracted, { extendCooldown });
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

  const dismissResendLimitDialog = useCallback(() => {
    setResendLimitDialogVisible(false);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (limits.locked && (limits.lockType === "resend_limit" || limits.lockType === "security")) {
        setLimits((current) => ({
          ...current,
          locked: false,
          lockType: null,
          retryAfterSeconds: 0,
        }));
        resendLimitDialogShownRef.current = false;
        setResendLimitDialogVisible(false);
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
  const showRateLimitBanner = secondsLeft > 0 && (!canResend || limits.locked);
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
    showRateLimitBanner,
    lastOtpErrorCode,
    clearOtpErrorCode: () => setLastOtpErrorCode(null),
    resendLimitDialogVisible,
    dismissResendLimitDialog,
  };
}
