"use client";

import { useState, useEffect } from "react";
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
} from "@/components/auth/auth-form-shell";
import { AuthAudiencePicker } from "@/components/auth/auth-audience-picker";
import { ResidentAuthForm } from "@/components/auth/resident-auth-form";
import { OtpVerifyStep } from "@/components/auth/otp-verify-step";
import { PhoneSignInStep } from "@/components/auth/phone-sign-in-step";
import { AuthRedirectOverlay } from "@/components/shared/loaders";
import { emptyPhoneField, phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";
import { HavenaAppScreenPreview } from "@/components/landing/ui/HavenaAppScreenPreview";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { resolvePostAuthPath, type AuthAudience } from "@/lib/auth/resolve-destination";
import { Suspense } from "react";

type OtpStep = "phone" | "code";

const COMMUNITY_DEMO_PHONE = "+15556668888";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planHint = searchParams.get("plan");
  const intervalHint = searchParams.get("interval") === "year" ? "year" : "month";
  const audienceParam = searchParams.get("audience");
  const audience: AuthAudience = audienceParam === "resident" ? "resident" : "admin";
  const planQuery = planHint
    ? `?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "";
  const registerHref =
    audience === "resident"
      ? "/register?audience=resident"
      : `/register${planQuery}`;
  const billingReturnPath = planHint
    ? `/admin/billing?plan=${encodeURIComponent(planHint)}&interval=${intervalHint}`
    : "/admin/billing";
  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [phoneResetKey, setPhoneResetKey] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("phone");
  const [otpIntent, setOtpIntent] = useState<CommunityAdminOtpIntent>("login");
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
      return;
    }

    router.replace(resolvePostAuthPath(user, { planQuery, billingReturnPath }));
  }, [router, planHint, billingReturnPath, planQuery]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.valid || !phone.e164 || otpSending) return;
    setError(null);
    setOtp("");
    setOtpStep("code");
    setOtpSending(true);
    try {
      const { intent } = await requestCommunityAdminOtp(phone.e164);
      setOtpIntent(intent);
    } catch (err) {
      setOtpStep("phone");
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
      const res = await verifyCommunityAdminOtp(phone.e164!, code, otpIntent);
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
      const { intent } = await requestCommunityAdminOtp(phone.e164);
      setOtpIntent(intent);
    } catch (err) {
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  const goBackToPhone = () => {
    setOtpStep("phone");
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
        Start your <em>community</em>
      </>
    );

  const subtitle =
    otpStep === "code"
      ? otpIntent === "signup"
        ? "Enter the code to create your community admin account"
        : "Enter the 6-digit SMS code to continue"
      : planHint
        ? `New or returning — after OTP you’ll set up your community and start ${planHint} checkout`
        : "New communities create an account with phone OTP. Existing admins sign in the same way.";

  return (
    <>
      {redirecting ? (
        <AuthRedirectOverlay
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
        <aside className="nl-login-hero">
          <div className="nl-login-hero__preview" aria-hidden>
            <HavenaAppScreenPreview />
          </div>
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
                {audience === "resident" ? "Resident portal" : "Community admin"}
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-brand)] text-[2.35rem] font-bold leading-[1.08] tracking-tight text-white xl:text-[2.9rem]">
                Havena
                <span className="mt-2 block font-[family-name:var(--font-display)] text-[1.35rem] font-semibold text-teal-200 xl:text-[1.55rem]">
                  {audience === "resident"
                    ? "Notices, feed, bills, and neighbors — on the web."
                    : "One subscription. Invite every resident."}
                </span>
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
                {audience === "resident"
                  ? "Sign in with the phone number on your Havena account. Residents never pay Havena — your community admin invites you."
                  : "Create your community account, choose a seat plan, and onboard neighbors — residents never pay Havena."}
              </p>
              <ul className="mt-6 space-y-2 text-[13px] text-white/65">
                {audience === "resident" ? (
                  <>
                    <li>• Phone OTP — same login as the mobile app</li>
                    <li>• Join with your community invite code</li>
                    <li>• Notices, feed, amenities, and messages</li>
                  </>
                ) : (
                  <>
                    <li>• Phone OTP — no password to manage</li>
                    <li>• Plans from 50 to 500 resident seats</li>
                    <li>• Billing unlocks invites after signup</li>
                  </>
                )}
              </ul>
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
            <a href={registerHref} className="nl-login-resident-link ml-auto">
              Create an account →
            </a>
          </div>

          <div className="nl-login-form-wrap">
            <div className="nl-login-brand nl-login-brand--form mb-6">
              <span className="nl-login-brand__mark !h-11 !w-11 !rounded-xl">
                <HavenaLogoMark />
              </span>
              <span className="nl-login-brand__name">Havena</span>
            </div>

            <div className="mb-5">
              <AuthAudiencePicker
                value={audience}
                disabled={otpSendingLocked && audience === "admin"}
                onChange={(next) => {
                  const params = new URLSearchParams(searchParams.toString());
                  if (next === "resident") params.set("audience", "resident");
                  else params.delete("audience");
                  const qs = params.toString();
                  router.replace(qs ? `/login?${qs}` : "/login");
                }}
              />
            </div>

            {audience === "resident" ? (
              <ResidentAuthForm
                mode="login"
                onSwitchMode={(next) => {
                  router.replace(next === "signup" ? "/register?audience=resident" : "/login?audience=resident");
                }}
              />
            ) : (
              <>
            {otpStep === "code" ? (
              <AuthBackLink onClick={goBackToPhone}>Back to phone</AuthBackLink>
            ) : null}

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

            {otpStep === "phone" ? (
              <PhoneSignInStep
                phoneValue={phone.e164}
                phoneResetKey={phoneResetKey}
                onPhoneChange={(state) => {
                  setPhone(state);
                  setError(null);
                }}
                onSubmit={handleSendOtp}
                onDemoFill={() => {
                  setPhone(phoneFieldFromE164(COMMUNITY_DEMO_PHONE));
                  setPhoneResetKey((k) => k + 1);
                  setError(null);
                }}
                demoLabel={`Try demo · ${COMMUNITY_DEMO_PHONE}`}
                sending={otpSending}
                disabled={otpSendingLocked || !phone.valid}
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
              {otpIntent === "signup" && otpStep === "code"
                ? "Creating your account… next you’ll name your community, then start your free trial."
                : "New community admin?"}{" "}
              <a
                href={`/register${planQuery}`}
                className="font-semibold text-[#0d9488] hover:underline"
              >
                Create an account
              </a>
              {" · "}
              <a href="/#pricing" className="font-semibold text-[#0d9488] hover:underline">
                View plans
              </a>
            </p>
              </>
            )}
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

function HavenaLogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 21V12h6v9" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
