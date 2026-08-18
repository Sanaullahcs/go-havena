"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  requestCommunityAdminOtp,
  verifyCommunityAdminOtp,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
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
} from "@/components/auth/auth-form-shell";
import { OtpVerifyStep } from "@/components/auth/otp-verify-step";
import { PhoneSignInStep } from "@/components/auth/phone-sign-in-step";
import { AuthRedirectOverlay } from "@/components/shared/loaders";
import { emptyPhoneField, type PhoneFieldState } from "@/lib/phone/format";
import { landingImages } from "@/lib/landing/site";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";

type OtpStep = "phone" | "code";

function RegisterPageInner() {
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
  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("phone");
  const [otpSending, setOtpSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBusy = loading || redirecting;
  const otpSendingLocked = isBusy || otpSending;
  const communityStep = otpStep === "phone" ? 1 : 2;

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
    if (!phone.valid || !phone.e164 || otpSending) return;
    setError(null);
    setOtp("");
    setOtpStep("code");
    setOtpSending(true);
    try {
      await requestCommunityAdminOtp(phone.e164, "signup");
    } catch (err) {
      setOtpStep("phone");
      if (err instanceof ApiError && err.code === "ACCOUNT_EXISTS_USE_LOGIN") {
        setError("This phone number is already registered. Use Sign in instead.");
        return;
      }
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== 6 || otpSending || loading || redirecting) return;
    setError(null);
    setLoading(true);
    try {
      const res = await verifyCommunityAdminOtp(phone.e164!, code, "signup");
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
      await handleLoginError(err, setError);
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!phone.e164) return;
    setError(null);
    setOtpSending(true);
    try {
      await requestCommunityAdminOtp(phone.e164, "signup");
    } catch (err) {
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  return (
    <>
      {redirecting ? (
        <AuthRedirectOverlay title="Creating your account" subtitle="Opening community setup…" />
      ) : null}

      <div className="nl-login-split">
        <aside className="nl-login-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={landingImages.hero} alt="" className="nl-login-hero__photo" aria-hidden />
          <div className="nl-login-hero__veil" aria-hidden />

          <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
            <div>
              <AuthBackLink href="/" variant="hero">
                Back
              </AuthBackLink>
              <div className="nl-login-brand nl-login-brand--hero mt-8">
                <span className="nl-login-brand__mark !h-10 !w-10 !rounded-xl">
                  <HavenaLogoMark />
                </span>
                <span className="text-[15px] font-bold text-white">Havena</span>
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal-200/90">
                Community admin signup
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-brand)] text-[2.35rem] font-bold leading-[1.08] tracking-tight text-white xl:text-[2.9rem]">
                Create your
                <span className="mt-2 block font-[family-name:var(--font-display)] text-[1.35rem] font-semibold text-teal-200 xl:text-[1.55rem]">
                  community admin account
                </span>
              </h2>
              <ol className="mt-6 space-y-2 text-[13px] text-white/70">
                <li>1. Verify your phone with a one-time code</li>
                <li>2. Create your community</li>
                <li>3. Complete your profile</li>
                <li>4. Add a card (trial starts after approval)</li>
                <li>5. Wait for Havena system approval</li>
              </ol>
            </div>

            <p className="text-[12px] text-white/40">© Havena · Community operator access</p>
          </div>
        </aside>

        <div className="nl-login-panel">
          <span className="nl-login-panel__accent hidden lg:block" aria-hidden />

          <div className="nl-login-topbar">
            <AuthBackLink href="/" variant="button">
              Back
            </AuthBackLink>
            <Link href={`/login${planQuery}`} className="nl-login-resident-link ml-auto">
              Already have an account? Sign in →
            </Link>
          </div>

          <div className="nl-login-form-wrap">
            <div className="nl-login-brand nl-login-brand--form mb-6">
              <span className="nl-login-brand__mark !h-11 !w-11 !rounded-xl">
                <HavenaLogoMark />
              </span>
              <span className="nl-login-brand__name">Havena</span>
            </div>

            {otpStep === "code" ? (
              <AuthBackLink
                onClick={() => {
                  setOtpStep("phone");
                  setOtp("");
                  setError(null);
                }}
              >
                Back to phone
              </AuthBackLink>
            ) : null}

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
                    ? "Enter the 6-digit SMS code to create your Havena admin account"
                    : planHint
                      ? `After signup you’ll set up your community and start the ${planHint} trial`
                      : "Use your phone number — we’ll create your community admin account"}
                </p>
              </div>
              <AuthStepDots step={communityStep} />
            </div>

            {error ? (
              <div className="mt-4">
                <AuthErrorBanner message={error} />
              </div>
            ) : null}

            {otpStep === "phone" ? (
              <PhoneSignInStep
                phoneValue={phone.e164}
                onPhoneChange={(state) => {
                  setPhone(state);
                  setError(null);
                }}
                onSubmit={handleSendOtp}
                sending={otpSending}
                disabled={otpSendingLocked || !phone.valid}
                submitLabel="Create account"
              />
            ) : (
              <OtpVerifyStep
                phoneE164={phone.e164!}
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
              Already registered?{" "}
              <Link href={`/login${planQuery}`} className="font-semibold text-[#0d9488] hover:underline">
                Sign in
              </Link>
              {" · "}
              <a href="/#pricing" className="font-semibold text-[#0d9488] hover:underline">
                View plans
              </a>
            </p>
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

function HavenaLogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
        stroke="white"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 21V12h6v9" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
