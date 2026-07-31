"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  requestCommunityAdminOtp,
  verifyCommunityAdminOtp,
} from "@/lib/api/auth";
import { setSession, getToken, getUser, canAccessCommunityDashboard } from "@/lib/auth/session";
import { handleLoginError } from "@/lib/auth/login-error";
import {
  AuthBackLink,
  AuthErrorBanner,
  AuthStepDots,
} from "@/components/auth/auth-form-shell";
import { OtpVerifyStep } from "@/components/auth/otp-verify-step";
import { PhoneSignInStep } from "@/components/auth/phone-sign-in-step";
import { AuthRedirectOverlay } from "@/components/shared/loaders";
import { emptyPhoneField, phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";

type OtpStep = "phone" | "code";

const COMMUNITY_DEMO_PHONE = "+15556668888";

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [phoneResetKey, setPhoneResetKey] = useState(0);
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
      router.replace("/admin");
      return;
    }

    // Keep the session — only redirect residents away from the admin login screen.
    if (user?.role === "resident") {
      router.replace("/home");
    }
  }, [router]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.valid || !phone.e164 || otpSending) return;
    setError(null);
    setOtp("");
    setOtpStep("code");
    setOtpSending(true);
    try {
      await requestCommunityAdminOtp(phone.e164);
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
      const res = await verifyCommunityAdminOtp(phone.e164!, code);
      setSession(res.token, res.user);
      setRedirecting(true);
      router.replace("/admin");
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
      await requestCommunityAdminOtp(phone.e164);
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
    otpStep === "code" ? <>Verify <em>code</em></> : <>Welcome <em>back</em></>;

  const subtitle =
    otpStep === "code"
      ? "6-digit code sent via SMS"
      : "Sign in with your mobile number";

  return (
    <>
      {redirecting ? (
        <AuthRedirectOverlay title="Opening your dashboard" subtitle="Loading your portal…" />
      ) : null}

      <div className="nl-login-split">
        <aside className="nl-login-hero">
          <div className="nl-auth-hero-pattern absolute inset-0" aria-hidden />
          <span className="nl-login-hero__orb nl-login-hero__orb--1" aria-hidden />
          <span className="nl-login-hero__orb nl-login-hero__orb--2" aria-hidden />

          <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
            <div>
              <AuthBackLink href="/" variant="hero">
                Back
              </AuthBackLink>
              <div className="nl-login-brand nl-login-brand--hero mt-8">
                <span className="nl-login-brand__mark !h-10 !w-10 !rounded-xl">
                  <NbrLogoMark />
                </span>
                <span className="text-[15px] font-bold text-white">NeighborLink</span>
              </div>
            </div>

            <div>
              <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-sky-200/80">
                Community admin portal
              </p>
              <h2 className="mt-3 text-[2.1rem] font-bold leading-[1.12] tracking-tight text-white xl:text-[2.75rem]">
                Manage your
                <span className="mt-1 block text-sky-300">neighborhood.</span>
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
                Secure sign-in for verified community operators.
              </p>
            </div>

            <p className="text-[12px] text-white/35">© NeighborLink · Secured access</p>
          </div>
        </aside>

        <div className="nl-login-panel">
          <span className="nl-login-panel__accent hidden lg:block" aria-hidden />

          <div className="nl-login-topbar">
            <AuthBackLink href="/" variant="button">
              Back
            </AuthBackLink>
            <a href="/resident-login" className="nl-login-resident-link ml-auto">
              Resident portal →
            </a>
          </div>

          <div className="nl-login-form-wrap">
            <div className="nl-login-brand nl-login-brand--form mb-6">
              <span className="nl-login-brand__mark !h-11 !w-11 !rounded-xl">
                <NbrLogoMark />
              </span>
              <span className="nl-login-brand__name">NeighborLink</span>
            </div>

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
          </div>
        </div>
      </div>
    </>
  );
}

function NbrLogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 21V12h6v9" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
