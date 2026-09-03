import { useCallback, useEffect, useState } from "react";
import { OTP_RESEND_SECONDS } from "../constants/otp-config";

export { OTP_RESEND_SECONDS };

export function formatOtpCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useOtpCountdown(initialSeconds = OTP_RESEND_SECONDS) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;

    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  const resetCountdown = useCallback(() => {
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  return {
    secondsLeft,
    canResend: secondsLeft <= 0,
    countdownLabel: formatOtpCountdown(secondsLeft),
    resetCountdown,
  };
}
