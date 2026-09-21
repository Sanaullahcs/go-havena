"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestResidentOtp, verifyResidentOtp, type ResidentOtpIntent } from "@/lib/api/auth";
import { setSession } from "@/lib/auth/session";
import { resolvePostAuthPath } from "@/lib/auth/resolve-destination";
import { handleLoginError } from "@/lib/auth/login-error";
import { AuthBackLink, AuthErrorBanner, AuthStepDots } from "@/components/auth/auth-form-shell";
import { OtpVerifyStep } from "@/components/auth/otp-verify-step";
import { PhoneSignInStep } from "@/components/auth/phone-sign-in-step";
import { AuthRedirectOverlay } from "@/components/shared/loaders";
import { emptyPhoneField, type PhoneFieldState } from "@/lib/phone/format";

type OtpStep = "phone" | "code";

export function ResidentAuthForm({
  mode,
  onSwitchMode,
}: {
  mode: ResidentOtpIntent;
  onSwitchMode?: (next: ResidentOtpIntent) => void;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("phone");
  const [otpSending, setOtpSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectSubtitle, setRedirectSubtitle] = useState("Opening your portal…");

  const isBusy = loading || redirecting;
  const isSignup = mode === "signup";

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.valid || !phone.e164 || otpSending) return;
    setError(null);
    setOtp("");
    setOtpStep("code");
    setOtpSending(true);
    try {
      await requestResidentOtp(phone.e164, mode);
    } catch (err) {
      setOtpStep("phone");
      await handleLoginError(err, setError);
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== 6 || otpSending || loading || redirecting || !phone.e164) return;
    setError(null);
    setLoading(true);
    try {
      const res = await verifyResidentOtp(phone.e164, code, mode);
      setSession(res.token, res.user);
      const next = resolvePostAuthPath(res.user);
      setRedirectSubtitle(
        next === "/join"
          ? "Enter your community invite code next…"
          : "Loading your resident portal…",
      );
      setRedirecting(true);
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
      await requestResidentOtp(phone.e164, mode);
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
          title={isSignup ? "Creating your account" : "Signing you in"}
          subtitle={redirectSubtitle}
        />
      ) : null}

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
            ) : isSignup ? (
              <>
                Join as a <em>resident</em>
              </>
            ) : (
              <>
                Resident <em>sign in</em>
              </>
            )}
          </h1>
          <p className="nl-login-subtitle">
            {otpStep === "code"
              ? "Enter the 6-digit SMS code we sent to your phone"
              : isSignup
                ? "Verify your phone, then enter the invite code from your community admin"
                : "Use the same phone number you use in the Havena app"}
          </p>
        </div>
        <AuthStepDots step={otpStep === "phone" ? 1 : 2} />
      </div>

      {error ? (
        <div className="mt-4">
          <AuthErrorBanner message={error} />
        </div>
      ) : null}

      {otpStep === "phone" ? (
        <PhoneSignInStep
          inputId="resident-phone"
          phoneValue={phone.e164}
          onPhoneChange={(state) => {
            setPhone(state);
            setError(null);
          }}
          onSubmit={handleSendOtp}
          sending={otpSending}
          disabled={isBusy || otpSending || !phone.valid}
          submitLabel={isSignup ? "Create resident account" : "Send code"}
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

      {onSwitchMode ? (
        <p className="mt-8 text-center text-[12px] text-slate-500">
          {isSignup ? "Already have a resident account?" : "New to this community?"}{" "}
          <button
            type="button"
            onClick={() => {
              onSwitchMode(isSignup ? "login" : "signup");
              setOtpStep("phone");
              setOtp("");
              setError(null);
            }}
            className="font-semibold text-[#0d9488] hover:underline"
          >
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </p>
      ) : null}
    </>
  );
}
