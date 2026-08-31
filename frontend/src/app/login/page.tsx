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
import {
  AuthBackLink,
  AuthErrorBanner,
  AuthStepDots,
  CommunityAuthTabs,
} from "@/components/auth/auth-form-shell";
import { OtpVerifyStep } from "@/components/auth/otp-verify-step";
import { EmailSignInStep } from "@/components/auth/email-sign-in-step";
import { AuthRedirectOverlay } from "@/components/shared/loaders";
import { CommunityAuthHero } from "@/components/auth/community-auth-hero";
import { HavenaMark } from "@/components/shared/havena-mark";
import { AuthLegalLinks } from "@/components/auth/auth-legal-links";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { consumeWebHandoffIfPresent } from "@/lib/auth/web-handoff";
import { Suspense } from "react";

type OtpStep = "email" | "code";

const COMMUNITY_DEMO_EMAIL = "test.community.admin@havena.app";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [otpIntent, setOtpIntent] = useState<CommunityAdminOtpIntent>("login");
  const [otpSending, setOtpSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verifyLock = useRef(false);

  const isBusy = loading || redirecting;
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
        router.replace(planHint ? billingReturnPath : "/admin");
        return;
      }

      if (isCommunityAdminUser(user)) {
        const step = getCommunityAdminNextStep(user);
        if (step === "ready" || canAccessCommunityDashboard(user)) {
          router.replace(planHint ? billingReturnPath : "/admin");
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
    if (!isValidEmail(email) || otpSending) return;
    setError(null);
    setOtp("");
    setOtpSending(true);
    try {
      const { intent } = await requestCommunityAdminOtp(email.trim(), "login");
      setOtpIntent(intent);
      setOtpStep("code");
    } catch (err) {
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== 6 || otpSending || loading || redirecting || verifyLock.current) return;
    verifyLock.current = true;
    setError(null);
    setLoading(true);
    try {
      const res = await verifyCommunityAdminOtp(email.trim(), code, otpIntent);
      setSession(res.token, res.user);
      setRedirecting(true);
      const step = getCommunityAdminNextStep(res.user);
      const next =
        canAccessCommunityDashboard(res.user) || step === "ready"
          ? planHint
            ? billingReturnPath
            : "/admin"
          : `${communityAdminOnboardingPath(step)}${planQuery}`;
      router.replace(next);
    } catch (err) {
      verifyLock.current = false;
      await handleLoginError(err, setError);
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!isValidEmail(email)) return;
    setError(null);
    setOtpSending(true);
    try {
      const { intent } = await requestCommunityAdminOtp(email.trim(), "login");
      setOtpIntent(intent);
    } catch (err) {
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  const goBackToEmail = () => {
    setOtpStep("email");
    setOtp("");
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
      ? otpIntent === "signup"
        ? "Enter the code to create your community admin account"
        : "Enter the 6-digit email code to continue"
        : planHint
        ? `New or returning — after OTP you’ll set up your community and start ${planHint} checkout`
        : "Sign in with the email on your community admin account.";

  return (
    <>
      {redirecting ? (
        <AuthRedirectOverlay
          variant={
            otpIntent === "signup" || !canAccessCommunityDashboard(getUser())
              ? "community-setup"
              : "community"
          }
          title={
            otpIntent === "signup" ? "Creating your account" : "Signing you in"
          }
          subtitle={
            otpIntent === "signup"
              ? "Opening community setup…"
              : canAccessCommunityDashboard(getUser())
                ? "Loading your dashboard…"
                : "Continuing setup…"
          }
        />
      ) : null}

      <div className="nl-login-split">
        <CommunityAuthHero
          eyebrow="Community admin"
          title="Havena"
          subtitle="One subscription. Invite every resident."
          body="Create your community account, choose a seat plan, and onboard neighbors — residents never pay Havena."
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
              <HavenaMark size={40} />
              <span className="nl-login-brand__name">Havena</span>
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
                onSubmit={handleSendOtp}
                onDemoFill={() => {
                  setEmail(COMMUNITY_DEMO_EMAIL);
                  setError(null);
                }}
                demoLabel={`Try demo · ${COMMUNITY_DEMO_EMAIL}`}
                sending={otpSending}
                disabled={otpSendingLocked || !isValidEmail(email)}
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
                verifying={loading && !redirecting}
                error={Boolean(error)}
              />
            )}

            <p className="mt-8 text-center text-[12px] text-slate-500">
              {otpIntent === "signup" && otpStep === "code"
                ? "Creating your account… next you’ll name your community, then start your free trial."
                : (
                  <>
                    Looking for a plan?{" "}
                    <a href="/plans" className="font-semibold text-[#0d9488] hover:underline">
                      View plans
                    </a>
                  </>
                )}
            </p>
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

