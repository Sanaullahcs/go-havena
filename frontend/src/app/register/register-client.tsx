"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getCommunityAdminSignupOtpChallenge,
  requestCommunityAdminOtp,
  verifyCommunityAdminOtp,
} from "@/lib/api/auth";
import {
  setSession,
  getToken,
  getUser,
  canAccessCommunityDashboard,
  getCommunityAdminNextStep,
  isCommunityAdminUser,
} from "@/lib/auth/session";
import { handleLoginError } from "@/lib/auth/login-error";
import {
  AuthBackLink,
  AuthErrorBanner,
  AuthStepDots,
  CommunityAuthTabs,
} from "@/components/auth/auth-form-shell";
import { OtpVerifyStep } from "@/components/auth/otp-verify-step";
import { EmailSignInStep } from "@/components/auth/email-sign-in-step";
import { CommunityAuthHero } from "@/components/auth/community-auth-hero";
import { HavenaLockup } from "@/components/shared/havena-lockup";
import { AuthLegalLinks } from "@/components/auth/auth-legal-links";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import {
  clearPersistedReferralCode,
  normalizeReferralCode,
  persistReferralCode,
  readPersistedReferralCode,
} from "@/lib/auth/referral-storage";
import { ApiError } from "@/lib/api/client";
import { confirmAction } from "@/lib/alert";
import { EMAIL_FORMAT_MESSAGE, isValidEmailAddress } from "@/lib/admin/form-validation-utils";
import {
  clearRegisterOtpChallenge,
  isPersistedChallengeFresh,
  persistRegisterOtpChallenge,
  rateLimitFromPersistedChallenge,
  readRegisterOtpChallenge,
  resendAvailableAtFromRateLimit,
  type PersistedRegisterOtpChallenge,
} from "@/lib/auth/register-otp-challenge";

type OtpStep = "email" | "code";

function freshChallenge(challenge: PersistedRegisterOtpChallenge | null | undefined) {
  return challenge && isPersistedChallengeFresh(challenge) ? challenge : null;
}

export function RegisterPageClient({
  initialChallenge = null,
}: {
  initialChallenge?: PersistedRegisterOtpChallenge | null;
}) {
  const restored = freshChallenge(initialChallenge);
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";
  const referralRawFromUrl = searchParams.get("ref");
  const referralCode = normalizeReferralCode(referralRawFromUrl) ?? readPersistedReferralCode();
  const planQuery = planHint
    ? `?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "";
  const tabQuery = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const billingReturnPath = planHint
    ? `/admin/billing?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "/admin/billing";
  const readyHomePath = (user?: { access?: { billing_exempt?: boolean } } | null) =>
    planHint && !user?.access?.billing_exempt ? billingReturnPath : "/admin";
  const [email, setEmail] = useState(restored?.email ?? "");
  const [emailFocused, setEmailFocused] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>(restored ? "code" : "email");
  const [otpSending, setOtpSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpRateLimit, setOtpRateLimit] = useState<unknown>(() =>
    restored ? rateLimitFromPersistedChallenge(restored) : null,
  );
  const [extendOtpResendCooldown, setExtendOtpResendCooldown] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(restored?.expiresAt ?? null);
  const [otpExpiresInSeconds, setOtpExpiresInSeconds] = useState<number | null>(null);
  const verifyLock = useRef(false);

  const rememberChallenge = (
    nextEmail: string,
    rateLimit: unknown,
    expiresAt?: string | null,
    expiresInSeconds?: number | null,
  ) => {
    setOtpRateLimit(rateLimit);
    setExtendOtpResendCooldown(false);
    if (expiresAt) setOtpExpiresAt(expiresAt);
    if (expiresInSeconds != null) setOtpExpiresInSeconds(expiresInSeconds);
    persistRegisterOtpChallenge({
      email: nextEmail,
      intent: "signup",
      expiresAt: expiresAt ?? otpExpiresAt,
      resendAvailableAt: resendAvailableAtFromRateLimit(rateLimit),
    });
  };

  const forgetChallenge = () => {
    clearRegisterOtpChallenge();
    setOtpExpiresAt(null);
    setOtpExpiresInSeconds(null);
    setOtpRateLimit(null);
    setOtp("");
    setOtpStep("email");
  };

  const isBusy = loading;
  const otpSendingLocked = isBusy || otpSending;
  const communityStep = otpStep === "email" ? 1 : 2;

  useEffect(() => {
    if (!referralRawFromUrl) return;

    const normalized = normalizeReferralCode(referralRawFromUrl);
    if (normalized) {
      persistReferralCode(normalized);
      // Clean a corrupted ?ref=… URL so the address bar only keeps the real code.
      if (normalized !== referralRawFromUrl.trim().toUpperCase()) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("ref", normalized);
        router.replace(`/register?${params.toString()}`);
      }
      return;
    }

    clearPersistedReferralCode();
    setOtpStep("email");
    setError(
      "This referral link is invalid or incomplete. You can still create an account without a referral code.",
    );
  }, [referralRawFromUrl, router, searchParams]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const user = getUser();
    if (canAccessCommunityDashboard(user)) {
      router.replace(readyHomePath(user));
      return;
    }
    if (isCommunityAdminUser(user)) {
      const step = getCommunityAdminNextStep(user);
      if (step === "ready" || canAccessCommunityDashboard(user)) {
        router.replace(readyHomePath(user));
        return;
      }
      router.replace(`${communityAdminOnboardingPath(step)}${planQuery}`);
    }
  }, [router, planHint, billingReturnPath, planQuery]);

  useLayoutEffect(() => {
    const pending = readRegisterOtpChallenge();
    if (!pending) return;
    setEmail(pending.email);
    setOtpExpiresAt(pending.expiresAt ?? null);
    setOtpRateLimit(rateLimitFromPersistedChallenge(pending));
    setOtpStep("code");
  }, []);

  useEffect(() => {
    const pending = freshChallenge(initialChallenge) ?? readRegisterOtpChallenge();
    if (!pending) return;

    let cancelled = false;
    const confirm = async () => {
      try {
        const challenge = await getCommunityAdminSignupOtpChallenge(pending.email);
        if (cancelled) return;
        if (!challenge.active) {
          forgetChallenge();
          return;
        }
        rememberChallenge(
          challenge.email ?? pending.email,
          challenge.rate_limit,
          challenge.expires_at ?? pending.expiresAt,
          challenge.expires_in_seconds,
        );
      } catch {
        // Keep the already-visible verification step.
      }
    };

    void confirm();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpSending) return;

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email is required.");
      return;
    }
    if (!isValidEmailAddress(trimmed)) {
      setError(EMAIL_FORMAT_MESSAGE);
      return;
    }

    const resolvedReferral =
      normalizeReferralCode(referralRawFromUrl) ?? readPersistedReferralCode();

    // Bad ref in the URL: warn on this screen, clear it, then continue signup normally.
    if (referralRawFromUrl && !resolvedReferral) {
      clearPersistedReferralCode();
      const params = new URLSearchParams(searchParams.toString());
      params.delete("ref");
      const qs = params.toString();
      router.replace(qs ? `/register?${qs}` : "/register");
      setError(
        "That referral link was invalid, so it was removed. Enter your email to continue without a referral.",
      );
      return;
    }

    if (resolvedReferral) {
      persistReferralCode(resolvedReferral);
    }

    setError(null);
    setOtp("");
    setOtpSending(true);
    try {
      const { rate_limit, expires_at, expires_in_seconds } = await requestCommunityAdminOtp(
        email.trim(),
        "signup",
      );
      rememberChallenge(email.trim(), rate_limit, expires_at, expires_in_seconds);
      setOtpStep("code");
    } catch (err) {
      if (err instanceof ApiError && err.code === "ACCOUNT_EXISTS_USE_LOGIN") {
        const result = await confirmAction({
          title: "Already registered",
          text: "This email belongs to an existing account. Please log in instead of signing up.",
          confirmText: "Go to login",
          icon: "warning",
          color: "blue",
        });
        if (result.isConfirmed) {
          router.push(`/login${planQuery}`);
        }
        return;
      }
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== 6 || otpSending || loading || verifyLock.current) return;
    verifyLock.current = true;
    setError(null);
    setLoading(true);
    try {
      const res = await verifyCommunityAdminOtp(
        email.trim(),
        code,
        "signup",
        referralCode,
      );
      clearPersistedReferralCode();
      clearRegisterOtpChallenge();
      setSession(res.token, res.user);
      const step = getCommunityAdminNextStep(res.user);
      const next =
        canAccessCommunityDashboard(res.user) || step === "ready"
          ? readyHomePath(res.user)
          : `${communityAdminOnboardingPath(step)}${planQuery}`;
      router.replace(next);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "";
      if (/referral/i.test(message)) {
        clearPersistedReferralCode();
        setOtpStep("email");
        setError(
          "This referral link is invalid. You can continue signup without a referral, or open a fresh invite link.",
        );
        verifyLock.current = false;
        setLoading(false);
        return;
      }
      verifyLock.current = false;
      if (err instanceof ApiError && err.rateLimit) {
        setOtpRateLimit(err.rateLimit);
        if (err.code === "INVALID_OTP" || err.code === "OTP_VERIFY_LOCKED") {
          setExtendOtpResendCooldown(true);
        }
        setError(err.message);
      } else {
        await handleLoginError(err, setError);
      }
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!isValidEmailAddress(email)) return;
    setError(null);
    setOtpSending(true);
    try {
      const { rate_limit, expires_at, expires_in_seconds } = await requestCommunityAdminOtp(
        email.trim(),
        "signup",
      );
      rememberChallenge(email.trim(), rate_limit, expires_at, expires_in_seconds);
      return { rate_limit, expires_at, expires_in_seconds };
    } catch (err) {
      if (err instanceof ApiError && (err.code?.startsWith("OTP_") ?? false)) {
        if (err.rateLimit) setOtpRateLimit(err.rateLimit);
        setError(err.message);
        return;
      }
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  return (
    <>
      <div className="nl-login-split">
        <CommunityAuthHero
          eyebrow="Community admin"
          title="Open the neighborhood"
          subtitle="to the people who live there."
          body="One admin account for the board. A private app for every resident."
        />

        <div className="nl-login-panel">
          <span className="nl-login-panel__accent hidden lg:block" aria-hidden />

          <div className="nl-login-topbar">
            <Link href={`/login${planQuery}`} className="nl-login-resident-link ml-auto">
              Already have an account? Sign in →
            </Link>
          </div>

          <div className="nl-login-form-wrap">
            <div className="nl-login-brand nl-login-brand--form mb-6">
              <HavenaLockup size={52} nameClassName="nl-login-brand__name" />
            </div>

            {otpStep === "email" ? (
              <CommunityAuthTabs active="register" query={tabQuery} />
            ) : (
              <AuthBackLink
                onClick={() => {
                  forgetChallenge();
                  setError(null);
                }}
              >
                Back to email
              </AuthBackLink>
            )}

            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="nl-login-title">
                  {otpStep === "code" ? (
                    <>
                      Verify <em>code</em>
                    </>
                  ) : (
                    <>
                      Register as <em>community admin</em>
                    </>
                  )}
                </h1>
                <p className="nl-login-subtitle">
                  {otpStep === "code"
                    ? "Enter the six-digit code we emailed you"
                    : planHint
                      ? `Next you will set up your community and continue with ${planHint}`
                      : "Enter your work email and we will send a one-time code."}
                </p>
              </div>
              <AuthStepDots step={communityStep} />
            </div>

            {error ? (
              <div className="mt-4">
                <AuthErrorBanner message={error} />
              </div>
            ) : null}

            {otpStep === "email" && referralCode && !error ? (
              <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-[13px] text-teal-900">
                Referral code <span className="font-semibold">{referralCode}</span> will be applied when you create your account.
              </div>
            ) : null}

            {otpStep === "email" ? (
              <EmailSignInStep
                email={email}
                onEmailChange={(value) => {
                  setEmail(value);
                  setError(null);
                }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onSubmit={handleSendOtp}
                sending={otpSending}
                disabled={otpSendingLocked || !isValidEmailAddress(email)}
                submitLabel="Create account"
                error={
                  emailFocused && email.trim() && !isValidEmailAddress(email)
                    ? EMAIL_FORMAT_MESSAGE
                    : null
                }
              />
            ) : (
              <OtpVerifyStep
                destination={email.trim()}
                otp={otp}
                onOtpChange={(value) => {
                  setOtp(value);
                  setError(null);
                }}
                onVerify={verifyOtp}
                onResend={resendOtp}
                sending={otpSending}
                verifying={loading}
                error={Boolean(error)}
                initialRateLimit={otpRateLimit}
                extendResendCooldown={extendOtpResendCooldown}
                expiresAt={otpExpiresAt}
                expiresInSeconds={otpExpiresInSeconds}
                onExpired={forgetChallenge}
              />
            )}
            <AuthLegalLinks className="mt-4" />
          </div>
        </div>
      </div>
    </>
  );
}

