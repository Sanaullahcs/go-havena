/** OTP timing shared between backend-aligned UI copy and resend countdown. */
export const OTP_EXPIRE_MINUTES = 5;
export const OTP_EXPIRE_SECONDS = OTP_EXPIRE_MINUTES * 60;
/** Wait before Resend is enabled. Code itself stays valid for OTP_EXPIRE_MINUTES. */
export const OTP_RESEND_SECONDS = 60;
