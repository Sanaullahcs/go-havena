"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
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
import { AuthRedirectOverlay } from "@/components/shared/loaders";
import { CommunityAuthHero } from "@/components/auth/community-auth-hero";
import { HavenaMark } from "@/components/shared/havena-mark";
import { AuthLegalLinks } from "@/components/auth/auth-legal-links";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { Building2, CreditCard, Mail, ShieldCheck, UserRound } from "lucide-react";
import {
  clearPersistedReferralCode,
  normalizeReferralCode,
  persistReferralCode,
  readPersistedReferralCode,
} from "@/lib/auth/referral-storage";
import { ApiError } from "@/lib/api/client";

type OtpStep = "email" | "code";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function RegisterPageInner() {
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
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [otpSending, setOtpSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verifyLock = useRef(false);

  const isBusy = loading || redirecting;
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
      router.replace(planHint ? billingReturnPath : "/admin");
      return;
    }
    if (isCommunityAdminUser(user)) {
      const step = getCommunityAdminNextStep(user);
      if (step === "ready" || canAccessCommunityDashboard(user)) {
        router.replace(planHint ? billingReturnPath : "/admin");
        return;
      }
      router.replace(`${communityAdminOnboardingPath(step)}${planQuery}`);
    }
  }, [router, planHint, billingReturnPath, planQuery]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email) || otpSending) return;

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
      await requestCommunityAdminOtp(email.trim(), "signup");
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
      const res = await verifyCommunityAdminOtp(
        email.trim(),
        code,
        "signup",
        referralCode,
      );
      clearPersistedReferralCode();
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
      await requestCommunityAdminOtp(email.trim(), "signup");
    } catch (err) {
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  return (
    <>
      {redirecting ? (
        <AuthRedirectOverlay
          variant="community-setup"
          title="Creating your account"
          subtitle="Opening community setup…"
        />
      ) : null}

      <div className="nl-login-split">
        <CommunityAuthHero
          eyebrow="Community admin signup"
          title="Create your"
          subtitle="community admin account"
          points={[
            { icon: Mail, text: "Verify your email with a one-time code" },
            { icon: Building2, text: "Create your community" },
            { icon: UserRound, text: "Complete your profile" },
            { icon: CreditCard, text: "Add a card — trial starts after approval" },
            { icon: ShieldCheck, text: "Wait for Havena system approval" },
          ]}
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
              <HavenaMark size={52} tight />
              <span className="nl-login-brand__name">Havena</span>
            </div>

            {otpStep === "email" ? (
              <CommunityAuthTabs active="register" query={tabQuery} />
            ) : (
              <AuthBackLink
                onClick={() => {
                  setOtpStep("email");
                  setOtp("");
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
                    ? "Enter the 6-digit email code to create your Havena admin account"
                    : planHint
                      ? `After signup you’ll set up your community and start the ${planHint} trial`
                      : "Use your email address — we’ll create your community admin account"}
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
                onSubmit={handleSendOtp}
                sending={otpSending}
                disabled={otpSendingLocked || !isValidEmail(email)}
                submitLabel="Create account"
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
            <AuthLegalLinks className="mt-4" />
          </div>
        </div>
      </div>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f8fd]" />}>
      <RegisterPageInner />
    </Suspense>
  );
}

