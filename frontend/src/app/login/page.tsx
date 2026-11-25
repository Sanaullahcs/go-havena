"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  requestCommunityAdminOtp,
  verifyCommunityAdminOtp,
  type CommunityAdminOtpIntent,
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
import { otpResendLockUserMessage, OTP_RESEND_LOCK_SECONDS } from "@/lib/auth/otp-config";
import { showOtpResendLockAlert } from "@/lib/alert";
import { normalizeOtpRateLimit } from "@/lib/auth/otp-rate-limit";
import { ApiError } from "@/lib/api/client";
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
import { consumeWebHandoffIfPresent } from "@/lib/auth/web-handoff";
import { validateEmailField } from "@/lib/admin/form-validation-utils";
import { Suspense } from "react";

type OtpStep = "email" | "code";

const COMMUNITY_DEMO_EMAIL = "tgi.admin@havena.app";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";
  const planQuery = planHint
    ? `?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "";
  const billingReturnPath = planHint
    ? `/admin/billing?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "/admin/billing";
  const readyHomePath = (user?: { access?: { billing_exempt?: boolean } } | null) =>
    planHint && !user?.access?.billing_exempt ? billingReturnPath : "/admin";
  const [email, setEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [otpIntent, setOtpIntent] = useState<CommunityAdminOtpIntent>("login");
  const [otpSending, setOtpSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpRateLimit, setOtpRateLimit] = useState<unknown>(null);
  const [extendOtpResendCooldown, setExtendOtpResendCooldown] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpExpiresInSeconds, setOtpExpiresInSeconds] = useState<number | null>(null);
  const verifyLock = useRef(false);

  const emailFieldError = validateEmailField(email);
  const emailValid = !emailFieldError;
  const inlineEmailError =
    emailFocused && email.trim().length > 0 ? emailFieldError : null;
  const isBusy = loading;
  const otpSendingLocked = isBusy || otpSending;
  const communityStep = otpStep === "email" ? 1 : 2;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const handedOff = await consumeWebHandoffIfPresent();
      if (cancelled) return;

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
        router.replace(
          handedOff && step === "complete_billing_web"
            ? billingReturnPath
            : `${communityAdminOnboardingPath(step)}${planQuery}`,
        );
        return;
      }

      if (user?.role === "resident") {
        router.replace("/home");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, planHint, billingReturnPath, planQuery]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpSending) return;

    const fieldError = validateEmailField(email);
    if (fieldError) {
      setEmailFocused(true);
      setError(fieldError);
      return;
    }

    setError(null);
    setOtp("");
    setOtpSending(true);
    try {
      const { intent, rate_limit, expires_at, expires_in_seconds } = await requestCommunityAdminOtp(
        email.trim(),
        "login",
      );
      setOtpIntent(intent);
      setOtpRateLimit(rate_limit);
      setExtendOtpResendCooldown(false);
      setOtpExpiresAt(expires_at);
      setOtpExpiresInSeconds(expires_in_seconds);
      setOtpStep("code");
    } catch (err) {
      if (err instanceof ApiError && err.code === "OTP_RESEND_LOCKED") {
        const limits = normalizeOtpRateLimit(err.rateLimit);
        setOtpRateLimit(err.rateLimit ?? null);
        setError(otpResendLockUserMessage());
        void showOtpResendLockAlert(
          limits.retryAfterSeconds > 0 ? limits.retryAfterSeconds : OTP_RESEND_LOCK_SECONDS,
        );
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
      const res = await verifyCommunityAdminOtp(email.trim(), code, otpIntent);
      setSession(res.token, res.user);
      const step = getCommunityAdminNextStep(res.user);
      const next =
        canAccessCommunityDashboard(res.user) || step === "ready"
          ? readyHomePath(res.user)
          : `${communityAdminOnboardingPath(step)}${planQuery}`;
      router.replace(next);
    } catch (err) {
      verifyLock.current = false;
      setLoading(false);
      if (err instanceof ApiError && err.rateLimit) {
        setOtpRateLimit(err.rateLimit);
        if (err.code === "INVALID_OTP" || err.code === "OTP_VERIFY_LOCKED") {
          setExtendOtpResendCooldown(true);
        }
        setError(err.code === "OTP_RESEND_LOCKED" ? otpResendLockUserMessage() : err.message);
      } else {
        await handleLoginError(err, setError);
      }
    }
  };

  const resendOtp = async () => {
    if (!emailValid) return;
    setError(null);
    setOtpSending(true);
    try {
      const { intent, rate_limit, expires_at, expires_in_seconds } = await requestCommunityAdminOtp(
        email.trim(),
        "login",
      );
      setOtpIntent(intent);
      setExtendOtpResendCooldown(false);
      setOtpExpiresAt(expires_at);
      setOtpExpiresInSeconds(expires_in_seconds);
      return { rate_limit, expires_at, expires_in_seconds };
    } catch (err) {
      if (err instanceof ApiError && (err.code?.startsWith("OTP_") ?? false)) {
        if (err.rateLimit) setOtpRateLimit(err.rateLimit);
        setError(err.code === "OTP_RESEND_LOCKED" ? otpResendLockUserMessage() : err.message);
        return;
      }
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  const goBackToEmail = () => {
    setOtpStep("email");
    setOtp("");
    setOtpExpiresAt(null);
    setOtpExpiresInSeconds(null);
    setError(null);
  };

  const headline =
    otpStep === "code" ? (
      <>
        Verify <em>code</em>
      </>
    ) : (
      <>
        Sign in to your <em>community</em>
      </>
    );

  const subtitle =
    otpStep === "code"
      ? "Enter the six-digit code we emailed you"
      : planHint
        ? `After you verify, we will continue with ${planHint}`
        : "Sign in with the email on your community admin account.";

  return (
    <>
      <div className="nl-login-split">
        <CommunityAuthHero
          eyebrow="Community admin"
          title="Welcome back"
          subtitle="to the community you already run."
          body="Notices, members, guests, and billing are waiting in your admin account."
        />

        <div className="nl-login-panel">
          <span className="nl-login-panel__accent hidden lg:block" aria-hidden />

          <div className="nl-login-topbar">
            <a href="/resident-login" className="nl-login-resident-link ml-auto">
              Resident portal →
            </a>
          </div>

          <div className="nl-login-form-wrap">
            <div className="nl-login-brand nl-login-brand--form mb-6">
              <HavenaLockup size={52} nameClassName="nl-login-brand__name" />
            </div>

            {otpStep === "email" ? (
              <CommunityAuthTabs active="login" query={planQuery} />
            ) : (
              <AuthBackLink onClick={goBackToEmail}>Back to email</AuthBackLink>
            )}

            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="nl-login-title">{headline}</h1>
                <p className="nl-login-subtitle">{subtitle}</p>
              </div>
              <AuthStepDots step={communityStep} />
            </div>

            {error ? (
              <div className="mt-4">
                <AuthErrorBanner message={error} />
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
                onDemoFill={() => {
                  setEmail(COMMUNITY_DEMO_EMAIL);
                  setError(null);
                }}
                demoLabel={`Try demo · ${COMMUNITY_DEMO_EMAIL}`}
                sending={otpSending}
                disabled={otpSendingLocked || !emailValid}
                error={inlineEmailError}
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
                onExpired={() => setError("This code has expired. Tap Resend code to get a new one.")}
              />
            )}

            {otpIntent === "signup" && otpStep === "code" ? (
              <p className="mt-8 text-center text-[12px] text-slate-500">
                Creating your account… next you’ll name your community, then start your free trial.
              </p>
            ) : null}
            <AuthLegalLinks className="mt-4" />
          </div>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f8fd]" />}>
      <LoginPageInner />
    </Suspense>
  );
}

