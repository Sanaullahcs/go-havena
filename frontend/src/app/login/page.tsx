"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  requestCommunityAdminOtp,
  verifyCommunityAdminOtp,
  requestResidentOtp,
  verifyResidentOtp,
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
import { OTP_RESEND_LOCK_SECONDS } from "@/lib/auth/otp-config";
import { showOtpResendLockAlert } from "@/lib/alert";
import { normalizeOtpRateLimit } from "@/lib/auth/otp-rate-limit";
import { ApiError } from "@/lib/api/client";
import {
  AuthBackLink,
  AuthErrorBanner,
  AuthStepDots,
  CommunityAuthTabs,
  LoginPortalTabs,
  type LoginPortalKind,
} from "@/components/auth/auth-form-shell";
import { OtpVerifyStep } from "@/components/auth/otp-verify-step";
import { EmailSignInStep } from "@/components/auth/email-sign-in-step";
import { CommunityAuthHero } from "@/components/auth/community-auth-hero";
import { HavenaLockup } from "@/components/shared/havena-lockup";
import { AuthLegalLinks } from "@/components/auth/auth-legal-links";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { consumeWebHandoffIfPresent } from "@/lib/auth/web-handoff";
import { validateEmailField } from "@/lib/admin/form-validation-utils";
import { useOtpResendLockMessage } from "@/hooks/use-otp-resend-lock-message";
import { setLandlordPortalLoginHint } from "@/lib/landlord-portal";
import { Suspense } from "react";

type OtpStep = "email" | "code";

const COMMUNITY_DEMO_EMAIL = "tgi.admin@havena.app";

function parseLoginPortal(value: string | null): LoginPortalKind {
  return value === "landlord" ? "landlord" : "community_admin";
}

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

  const [loginPortal, setLoginPortal] = useState<LoginPortalKind>(() =>
    parseLoginPortal(searchParams.get("portal")),
  );
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
  const {
    lockMessage,
    startResendLock,
    startResendLockFromError,
    clearResendLock,
  } = useOtpResendLockMessage();
  const bannerError = lockMessage ?? error;

  const emailFieldError = validateEmailField(email);
  const emailValid = !emailFieldError;
  const inlineEmailError =
    emailFocused && email.trim().length > 0 ? emailFieldError : null;
  const isBusy = loading;
  const otpSendingLocked = isBusy || otpSending;
  const communityStep = otpStep === "email" ? 1 : 2;
  const isLandlordPortal = loginPortal === "landlord";

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
        const portal = parseLoginPortal(searchParams.get("portal"));
        router.replace(portal === "landlord" ? "/landlord/dashboard" : "/home");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, planHint, billingReturnPath, planQuery, searchParams]);

  const switchPortal = (portal: LoginPortalKind) => {
    if (portal === loginPortal) return;
    setLoginPortal(portal);
    setError(null);
    clearResendLock();
    setOtpStep("email");
    setOtp("");
    setOtpExpiresAt(null);
    setOtpExpiresInSeconds(null);
    const params = new URLSearchParams(searchParams.toString());
    if (portal === "landlord") {
      params.set("portal", "landlord");
    } else {
      params.delete("portal");
    }
    const qs = params.toString();
    router.replace(qs ? `/login?${qs}` : "/login", { scroll: false });
  };

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
    clearResendLock();
    setOtp("");
    setOtpSending(true);
    try {
      if (isLandlordPortal) {
        const { rate_limit, expires_at, expires_in_seconds } = await requestResidentOtp(email.trim());
        setOtpIntent("login");
        setOtpRateLimit(rate_limit);
        setExtendOtpResendCooldown(false);
        setOtpExpiresAt(expires_at);
        setOtpExpiresInSeconds(expires_in_seconds);
      } else {
        const { intent, rate_limit, expires_at, expires_in_seconds } = await requestCommunityAdminOtp(
          email.trim(),
          "login",
        );
        setOtpIntent(intent);
        setOtpRateLimit(rate_limit);
        setExtendOtpResendCooldown(false);
        setOtpExpiresAt(expires_at);
        setOtpExpiresInSeconds(expires_in_seconds);
      }
      setOtpStep("code");
    } catch (err) {
      if (err instanceof ApiError && err.code === "OTP_RESEND_LOCKED") {
        const limits = normalizeOtpRateLimit(err.rateLimit);
        const lockSeconds =
          limits.retryAfterSeconds > 0 ? limits.retryAfterSeconds : OTP_RESEND_LOCK_SECONDS;
        setOtpRateLimit(err.rateLimit ?? null);
        setError(null);
        startResendLock(lockSeconds);
        void showOtpResendLockAlert(lockSeconds);
        return;
      }
      clearResendLock();
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== 6 || otpSending || loading || verifyLock.current) return;
    verifyLock.current = true;
    setError(null);
    clearResendLock();
    setLoading(true);
    try {
      if (isLandlordPortal) {
        const res = await verifyResidentOtp(email.trim(), code);
        setSession(res.token, res.user);
        setLandlordPortalLoginHint(true);
        router.replace("/landlord/dashboard");
        return;
      }

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
        if (err.code === "OTP_RESEND_LOCKED") {
          setError(null);
          startResendLockFromError(err);
        } else {
          clearResendLock();
          setError(err.message);
        }
      } else {
        clearResendLock();
        await handleLoginError(err, setError);
      }
    }
  };

  const resendOtp = async () => {
    if (!emailValid) return;
    setError(null);
    clearResendLock();
    setOtpSending(true);
    try {
      if (isLandlordPortal) {
        const { rate_limit, expires_at, expires_in_seconds } = await requestResidentOtp(email.trim());
        setExtendOtpResendCooldown(false);
        setOtpExpiresAt(expires_at);
        setOtpExpiresInSeconds(expires_in_seconds);
        return { rate_limit, expires_at, expires_in_seconds };
      }

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
        if (err.code === "OTP_RESEND_LOCKED") {
          setError(null);
          startResendLockFromError(err);
        } else {
          clearResendLock();
          setError(err.message);
        }
        return;
      }
      clearResendLock();
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
    clearResendLock();
  };

  const headline =
    otpStep === "code" ? (
      <>
        Verify <em>code</em>
      </>
    ) : isLandlordPortal ? (
      <>
        Landlord <em>sign in</em>
      </>
    ) : (
      <>
        Sign in to your <em>community</em>
      </>
    );

  const subtitle =
    otpStep === "code"
      ? "Enter the six-digit code we emailed you"
      : isLandlordPortal
        ? "Use the email on your resident account to open My Properties and landlord tools."
        : planHint
          ? `After you verify, we will continue with ${planHint}`
          : "Sign in with the email on your community admin account.";

  const hero = isLandlordPortal
    ? {
        eyebrow: "Landlord",
        title: "Your properties,",
        subtitle: "billing, and tenants in one place.",
        body: "Sign in with the same resident email you use in the community—then manage vacant, rented, and owned units.",
      }
    : {
        eyebrow: "Community admin",
        title: "Welcome back",
        subtitle: "to the community you already run.",
        body: "Notices, members, guests, and billing are waiting in your admin account.",
      };

  return (
    <>
      <div className="nl-login-split">
        <CommunityAuthHero
          eyebrow={hero.eyebrow}
          title={hero.title}
          subtitle={hero.subtitle}
          body={hero.body}
        />

        <div className="nl-login-panel">
          <span className="nl-login-panel__accent hidden lg:block" aria-hidden />

          <div className="nl-login-topbar">
            <a href="/resident-login" className="nl-login-resident-link ml-auto">
              Resident sign-in →
            </a>
          </div>

          <div className="nl-login-form-wrap">
            <div className="nl-login-brand nl-login-brand--form mb-6">
              <HavenaLockup size={52} nameClassName="nl-login-brand__name" />
            </div>

            {otpStep === "email" ? (
              <LoginPortalTabs
                active={loginPortal}
                onChange={switchPortal}
                disabled={otpSendingLocked}
              />
            ) : null}

            {otpStep === "email" && !isLandlordPortal ? (
              <CommunityAuthTabs active="login" query={planQuery} />
            ) : otpStep === "code" ? (
              <AuthBackLink onClick={goBackToEmail}>Back to email</AuthBackLink>
            ) : null}

            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="nl-login-title">{headline}</h1>
                <p className="nl-login-subtitle">{subtitle}</p>
              </div>
              <AuthStepDots step={communityStep} />
            </div>

            {bannerError ? (
              <div className="mt-4">
                <AuthErrorBanner message={bannerError} />
              </div>
            ) : null}

            {otpStep === "email" ? (
              <EmailSignInStep
                email={email}
                onEmailChange={(value) => {
                  setEmail(value);
                  setError(null);
                  clearResendLock();
                }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onSubmit={handleSendOtp}
                onDemoFill={
                  isLandlordPortal
                    ? undefined
                    : () => {
                        setEmail(COMMUNITY_DEMO_EMAIL);
                        setError(null);
                        clearResendLock();
                      }
                }
                demoLabel={isLandlordPortal ? undefined : `Try demo · ${COMMUNITY_DEMO_EMAIL}`}
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
                  clearResendLock();
                }}
                onVerify={verifyOtp}
                onResend={resendOtp}
                sending={otpSending}
                verifying={loading}
                error={Boolean(bannerError)}
                initialRateLimit={otpRateLimit}
                extendResendCooldown={extendOtpResendCooldown}
                expiresAt={otpExpiresAt}
                expiresInSeconds={otpExpiresInSeconds}
                onExpired={() => {
                  clearResendLock();
                  setError("This code has expired. Tap Resend code to get a new one.");
                }}
              />
            )}

            {otpIntent === "signup" && otpStep === "code" && !isLandlordPortal ? (
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