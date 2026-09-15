/** OTP timing — aligned with mobile `apps/mobile/constants/otp-config.js`. */
export const OTP_EXPIRE_MINUTES = 5;
export const OTP_RESEND_SECONDS = 60;

export function formatOtpCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
