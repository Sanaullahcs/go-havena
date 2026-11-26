"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestResidentOtp, verifyResidentOtp } from "@/lib/api/auth";
import { setSession, getToken } from "@/lib/auth/session";
import { handleLoginError } from "@/lib/auth/login-error";
import { OTP_RESEND_LOCK_SECONDS } from "@/lib/auth/otp-config";
import { showOtpResendLockAlert } from "@/lib/alert";
import { normalizeOtpRateLimit } from "@/lib/auth/otp-rate-limit";
import { ApiError } from "@/lib/api/client";
import { validateEmailField } from "@/lib/admin/form-validation-utils";
import { LoadingButton } from "@/components/shared/loaders";
import { OtpVerifyStep } from "@/components/auth/otp-verify-step";
import { AuthLegalLinks } from "@/components/auth/auth-legal-links";
import { HavenaLockup } from "@/components/shared/havena-lockup";
import { useOtpResendLockMessage } from "@/hooks/use-otp-resend-lock-message";

const DEMO_ACCOUNTS = [
  { label: "Resident", email: "sarah@havena.app", accent: "#14B8A6" },
  { label: "Resident 2", email: "david@havena.app", accent: "#0D9488" },
];

type OtpStep = "email" | "code";

function ResidentLoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailRef = useRef<HTMLInputElement>(null);
  const verifyLock = useRef(false);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [otpSending, setOtpSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpRateLimit, setOtpRateLimit] = useState<unknown>(null);
  const [extendOtpResendCooldown, setExtendOtpResendCooldown] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpExpiresInSeconds, setOtpExpiresInSeconds] = useState<number | null>(null);
  const {
    lockMessage,
    startResendLock,
    startResendLockFromError,
    clearResendLock,
  } = useOtpResendLockMessage();
  const bannerError = lockMessage ?? error;

  useEffect(() => {
    // Legacy email links used /resident-login?staff_invite=… — never auto-accept or send to the dashboard.
    const legacyToken = searchParams.get("staff_invite");
    if (legacyToken) {
      router.replace(`/staff-invite?token=${encodeURIComponent(legacyToken)}`);
      return;
    }
    if (getToken()) router.replace("/home");
    emailRef.current?.focus();
  }, [router, searchParams]);

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otpSending) return;

    const fieldError = validateEmailField(email);
    if (fieldError) {
      setError(fieldError);
      return;
    }

    setError(null);
    clearResendLock();
    setOtp("");
    setOtpSending(true);
    try {
      const { rate_limit, expires_at, expires_in_seconds } = await requestResidentOtp(email.trim());
      setOtpRateLimit(rate_limit);
      setExtendOtpResendCooldown(false);
      setOtpExpiresAt(expires_at);
      setOtpExpiresInSeconds(expires_in_seconds);
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
      const res = await verifyResidentOtp(email.trim(), code);
      setSession(res.token, res.user);
      router.replace("/home");
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
    setError(null);
    clearResendLock();
    setOtpSending(true);
    try {
      const { rate_limit, expires_at, expires_in_seconds } = await requestResidentOtp(email.trim());
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

  const fillDemo = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(acc.email);
    setError(null);
    clearResendLock();
    setOtpStep("email");
    setOtp("");
  };

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#f4f8fd]">
      {/* Top header */}
      <header className="z-20 w-full shrink-0 border-b border-slate-200/70 bg-white">
        <div className="flex w-full items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <a href="/" className="inline-flex min-w-0 items-center rounded-lg outline-none ring-teal-500/30 focus-visible:ring-2">
            <HavenaLockup size={48} label="Resident Portal" />
          </a>
          <a href="/login" className="resident-header-cta inline-flex text-[13px] sm:text-sm">
            Admin Portal
            <ArrowRightIcon />
          </a>
        </div>
      </header>

      {/* Split layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left hero — ocean breeze teal */}
        <aside className="resident-auth-hero relative hidden min-h-0 w-[46%] shrink-0 flex-col lg:flex xl:w-1/2">
          <div className="resident-auth-hero-pattern absolute inset-0" aria-hidden />
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" aria-hidden />
          <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full border border-white/10" aria-hidden />

          <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-14">
            <div className="pt-4 xl:pt-8">
              <p className="text-sm text-white/70">Resident portal</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white xl:text-[2.5rem]">
                <span className="block">Your neighborhood,</span>
                <span className="block text-teal-200">on your phone.</span>
              </h2>
              <ul className="mt-5 flex max-w-md flex-col gap-2 list-none p-0 text-[13.5px] text-white/65">
                <HeroBullet>Read notices and events from your community</HeroBullet>
                <HeroBullet>Join a private feed meant only for neighbors</HeroBullet>
                <HeroBullet>Find deals, amenities, and wellness in one place</HeroBullet>
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { title: "Notices",    desc: "Community announcements & events", Icon: IconNotices  },
                { title: "Feed",       desc: "Neighbor posts & discussions",      Icon: IconFeed     },
                { title: "Marketplace", desc: "Local deals & resident listings",  Icon: IconMarket   },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-white/15 bg-white/[0.08] p-3.5 backdrop-blur-sm">
                  <span className="text-white/90"><f.Icon /></span>
                  <p className="mt-2.5 text-[13px] font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/55">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Right: form */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
            <div className="w-full max-w-sm">
              <div>
                <h1 style={{ fontSize: "1.875rem", fontWeight: 700, letterSpacing: "-0.025em", color: "#0A2A43" }}>
                  {otpStep === "code" ? "Verify code" : "Resident Sign In"}
                </h1>
                <p className="nl-subtitle mt-3">
                  {otpStep === "code"
                    ? "Enter the six-digit code we emailed you."
                    : "Enter your email and we will send a verification code."}
                </p>
              </div>

              {otpStep === "code" ? (
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep("email");
                    setOtp("");
                    setOtpExpiresAt(null);
                    setOtpExpiresInSeconds(null);
                    setError(null);
                    clearResendLock();
                  }}
                  className="mt-4 text-[13px] font-semibold text-[#0D9488] hover:text-[#0A2A43]"
                >
                  ← Back to email
                </button>
              ) : null}

              {bannerError && (
                <div className="mt-5 flex gap-2.5 rounded-lg border border-red-200/80 bg-red-50 px-3.5 py-3 text-[13px] text-red-700" role="alert">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden className="mt-0.5 shrink-0">
                    <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M9 5.5v4M9 11.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  {bannerError}
                </div>
              )}

              {otpStep === "email" ? (
                <form onSubmit={sendOtp} className="mt-8 space-y-4" noValidate>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[#0A2A43]">Email address</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[rgba(10,42,67,0.42)]">
                        <IconEmail />
                      </span>
                      <input
                        ref={emailRef}
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError(null);
                          clearResendLock();
                        }}
                        className="resident-auth-input"
                        style={{ paddingLeft: "2.625rem", paddingRight: "0.875rem" }}
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <LoadingButton
                      type="submit"
                      disabled={otpSending || loading}
                      loading={otpSending}
                      loadingText="Sending code…"
                      className="resident-auth-btn group w-full"
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        Continue
                        <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </LoadingButton>
                  </div>
                </form>
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

              {/* Demo credentials */}
              <div className="mt-7">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-200" />
                  <p className="shrink-0 text-xs text-slate-400">Demo accounts</p>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillDemo(acc)}
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition",
                        email === acc.email
                          ? "border-teal-300 bg-teal-50 text-[#0D9488] shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50/40 hover:text-[#0D9488]",
                      ].join(" ")}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: acc.accent }} />
                      {acc.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-center text-[11px] text-slate-400">Click a demo pill to auto-fill credentials</p>
              </div>

              <p className="mt-5 text-center text-[12px] text-slate-400">
                Havena Resident Portal · Community access
              </p>
              <AuthLegalLinks className="mt-3" />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .resident-auth-hero { background: #1B4F8A; }
        .resident-auth-hero-pattern {
          pointer-events: none; opacity: 0.45;
          background-image: linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 52px 52px;
          mask-image: radial-gradient(ellipse 90% 80% at 30% 30%, black, transparent);
        }
        .resident-auth-input {
          width: 100%; border-radius: 0.75rem; border: 1px solid #e2e8f0; background: #fff;
          padding-top: 0.75rem; padding-bottom: 0.75rem; padding-left: 0.875rem; padding-right: 0.875rem;
          font-size: 0.875rem; color: #0f172a; outline: none;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .resident-auth-input::placeholder { color: rgba(100,116,139,0.8); }
        .resident-auth-input:hover { border-color: #cbd5e1; }
        .resident-auth-input:focus { border-color: #14b8a6; box-shadow: 0 0 0 3px rgba(20,184,166,0.15); }
        .resident-auth-btn {
          border-radius: 9999px; padding: 0.75rem 1rem; font-size: 0.875rem; font-weight: 600;
          color: #fff; background: #14b8a6;
          box-shadow: none; transition: background 150ms;
          outline: none; cursor: pointer; width: 100%;
        }
        .resident-auth-btn:hover { background: #0d9488; }
        .resident-auth-btn:disabled { cursor: not-allowed; opacity: 0.5; }
        .resident-header-cta {
          display: inline-flex; align-items: center; gap: 0.375rem; border-radius: 9999px;
          border: 1px solid rgba(13,148,136,0.25); background: #ccfbf1;
          padding: 0.5rem 1rem; font-size: 0.8125rem; font-weight: 600; color: #1B4F8A; transition: background 150ms;
        }
        .resident-header-cta:hover { background: #99f6e4; }
      `}</style>
    </main>
  );
}

export default function ResidentLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f8fd]" />}>
      <ResidentLoginPageInner />
    </Suspense>
  );
}

function HeroBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[0.2em] shrink-0 text-teal-200">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M2 7h8M7.5 4.5L10 7l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="2" cy="7" r="1" fill="currentColor" />
        </svg>
      </span>
      <span className="min-w-0 leading-snug">{children}</span>
    </li>
  );
}

function ArrowRightIcon({ className = "" }: { className?: string }) {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className={className}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IconEmail() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IconNotices() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function IconFeed() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" /><path d="M3 20c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M15 12h6M15 16h4M15 20h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function IconMarket() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 8h12l-1.2 11H7.2L6 8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}
