"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loginWithEmail,
  requestSignupOtp,
  verifySignupOtp,
} from "@/lib/api/auth";
import { setSession, getToken } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import {
  emptyPhoneField,
  formatPhoneDisplay,
  type PhoneFieldState,
} from "@/lib/phone/format";

type AuthTab = "login" | "signup";
type SignupRole = "resident" | "admin";
type SignupStep = "role" | "phone" | "code";

const DEMO_RESIDENT = { email: "sarah@havena.app", password: "password" };

function resolvePostLoginPath(role?: string) {
  if (role === "system_admin" || role === "admin" || role === "community_admin") {
    return role === "system_admin" || role === "admin"
      ? "/admin/community-admins"
      : "/admin";
  }
  return "/home";
}

function resolvePostSignupPath(user: { role?: string; community_admin_status?: string | null }) {
  if (user.role === "community_admin") {
    if (user.community_admin_status === "approved") return "/admin";
    return null;
  }
  if (user.role === "resident") return "/home";
  return null;
}

export function AuthPanel() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupRole, setSignupRole] = useState<SignupRole>("resident");
  const [signupStep, setSignupStep] = useState<SignupStep>("role");
  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupComplete, setSignupComplete] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token) return;
    if (tab === "login") emailRef.current?.focus();
  }, [tab]);

  const isBusy = loading || redirecting;

  const switchTab = (next: AuthTab) => {
    setTab(next);
    setError(null);
    setSignupStep("role");
    setOtp("");
    setSignupComplete(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const res = await loginWithEmail(email.trim(), password);
      setSession(res.token, res.user);
      setRedirecting(true);
      router.replace(resolvePostLoginPath(res.user?.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendSignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.valid || !phone.e164) return;
    setError(null);
    setLoading(true);
    try {
      await requestSignupOtp(phone.e164);
      setSignupStep("code");
      setOtp("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6 || !phone.e164) return;
    setError(null);
    setLoading(true);
    try {
      const res = await verifySignupOtp(phone.e164, otp, signupRole);
      setSession(res.token, res.user);
      const path = resolvePostSignupPath(res.user);
      if (path) {
        setRedirecting(true);
        router.replace(path);
        return;
      }
      setSignupComplete(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid verification code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth" className="nl-landing-auth-card">
      <div className="nl-landing-auth-tabs">
        <button
          type="button"
          onClick={() => switchTab("login")}
          className={tab === "login" ? "nl-landing-auth-tab active" : "nl-landing-auth-tab"}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => switchTab("signup")}
          className={tab === "signup" ? "nl-landing-auth-tab active" : "nl-landing-auth-tab"}
        >
          Sign Up
        </button>
      </div>

      {error && (
        <div className="nl-landing-auth-error" role="alert">
          {error}
        </div>
      )}

      {tab === "login" ? (
        <form onSubmit={handleLogin} className="nl-landing-auth-form" noValidate>
          <div>
            <label className="nl-label mb-1.5">Email address</label>
            <input
              ref={emailRef}
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              className="nl-auth-input w-full"
            />
          </div>
          <div>
            <label className="nl-label mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                className="nl-auth-input w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-600"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <button type="submit" disabled={isBusy} className="nl-auth-btn w-full">
            {isBusy ? (redirecting ? "Opening portal…" : "Signing in…") : "Sign In"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail(DEMO_RESIDENT.email);
              setPassword(DEMO_RESIDENT.password);
              setError(null);
            }}
            className="text-center text-[12px] text-blue-600 hover:underline"
          >
            Use demo account ({DEMO_RESIDENT.email})
          </button>
          <p className="text-center text-[12px] text-slate-500">
            Community admin?{" "}
            <a href="/login" className="font-semibold text-blue-600 hover:underline">
              Sign in with phone
            </a>
          </p>
        </form>
      ) : signupComplete ? (
        <div className="nl-landing-auth-success">
          <div className="nl-landing-auth-success-icon">✓</div>
          <h3 className="text-lg font-bold text-slate-900">Account created!</h3>
          <p className="mt-2 text-sm text-slate-600">
            {signupRole === "admin"
              ? "Your community admin application is pending. Download the Havena app to complete setup."
              : "Welcome to Havena! Download the mobile app to join your community and complete your profile."}
          </p>
          <a href="/home" className="nl-auth-btn mt-5 inline-flex w-full justify-center">
            Continue to portal
          </a>
        </div>
      ) : signupStep === "role" ? (
        <div className="nl-landing-auth-form">
          <p className="text-sm text-slate-600">Choose your role to get started.</p>
          <div className="grid gap-3">
            {([
              {
                key: "resident" as const,
                title: "Resident",
                desc: "Join your community, notices, feed & marketplace",
                accent: "border-emerald-200 bg-emerald-50",
              },
              {
                key: "admin" as const,
                title: "Community Admin",
                desc: "Manage your building or neighborhood",
                accent: "border-sky-200 bg-sky-50",
              },
            ]).map((role) => (
              <button
                key={role.key}
                type="button"
                onClick={() => {
                  setSignupRole(role.key);
                  setSignupStep("phone");
                  setError(null);
                }}
                className={`rounded-xl border p-4 text-left transition hover:shadow-md ${role.accent} ${
                  signupRole === role.key ? "ring-2 ring-blue-500/30" : ""
                }`}
              >
                <p className="font-semibold text-slate-900">{role.title}</p>
                <p className="mt-1 text-xs text-slate-600">{role.desc}</p>
              </button>
            ))}
          </div>
        </div>
      ) : signupStep === "phone" ? (
        <form onSubmit={handleSendSignupOtp} className="nl-landing-auth-form" noValidate>
          <p className="text-sm text-slate-600">
            Signing up as{" "}
            <span className="font-semibold text-slate-900">
              {signupRole === "admin" ? "Community Admin" : "Resident"}
            </span>
          </p>
          <div>
            <label className="nl-label mb-1.5">Phone number</label>
            <AdminPhoneInput
              required
              onChange={(state) => { setPhone(state); setError(null); }}
            />
          </div>
          <button type="submit" disabled={isBusy || !phone.valid} className="nl-auth-btn w-full">
            {loading ? "Sending code…" : "Send Verification Code"}
          </button>
          <button
            type="button"
            onClick={() => { setSignupStep("role"); setError(null); }}
            className="text-center text-[12px] text-slate-500 hover:text-slate-800"
          >
            Change role
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifySignup} className="nl-landing-auth-form" noValidate>
          <p className="text-sm text-slate-600">
            Code sent to{" "}
            <span className="font-medium text-slate-900">{formatPhoneDisplay(phone.e164)}</span>
          </p>
          <div>
            <label className="nl-label mb-1.5">6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              required
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
              className="nl-auth-input w-full tracking-[0.3em]"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">Dev OTP in local environment: 123456</p>
          </div>
          <button type="submit" disabled={isBusy || otp.length !== 6} className="nl-auth-btn w-full">
            {isBusy ? "Creating account…" : "Verify & Create Account"}
          </button>
          <button
            type="button"
            onClick={() => { setSignupStep("phone"); setOtp(""); setError(null); }}
            className="text-center text-[12px] text-slate-500 hover:text-slate-800"
          >
            Change phone number
          </button>
        </form>
      )}
    </div>
  );
}
