import {
  normalizeOtpRateLimit,
  extractOtpRateLimitFromError,
} from "../src/lib/auth/otp-rate-limit";
import { ApiError } from "../src/lib/api/client";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const apiPayload = {
  locked: true,
  lock_type: "resend_limit" as const,
  retry_after_seconds: 900,
  resends_remaining: 0,
  resend_limit: 3,
};

const once = normalizeOtpRateLimit(apiPayload);
assert(once.locked === true, "locked from API");
assert(once.lockType === "resend_limit", "lock type from API");
assert(once.retryAfterSeconds === 900, "retry from API");

const twice = normalizeOtpRateLimit(once);
assert(twice.locked === true, "double normalize keeps locked");
assert(twice.lockType === "resend_limit", "double normalize keeps lock type");
assert(twice.retryAfterSeconds === 900, "double normalize keeps retry seconds");

const err = new ApiError("Too many code requests.", 429, {
  code: "OTP_RESEND_LOCKED",
  retryAfterSeconds: 900,
  rateLimit: apiPayload,
});
const fromErr = extractOtpRateLimitFromError(err);
assert(fromErr?.lockType === "resend_limit", "error extract lock type");
assert(fromErr?.retryAfterSeconds === 900, "error extract retry");

const mailFailed = new ApiError("We could not send a verification email. Please try again.", 503, {
  code: "OTP_MAIL_FAILED",
});
assert(extractOtpRateLimitFromError(mailFailed) === null, "mail failure is not a resend cooldown");

console.log("OTP rate-limit UI helpers: all checks passed.");
