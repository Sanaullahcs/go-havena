"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithEmail } from "@/lib/api/auth";
import { setSession, getToken, getUser, isSystemAdminUser } from "@/lib/auth/session";
import { handleLoginError } from "@/lib/auth/login-error";
import { AuthErrorBanner } from "@/components/auth/auth-form-shell";
import { SystemSignInStep } from "@/components/auth/system-sign-in-step";
import { AuthRedirectOverlay } from "@/components/shared/loaders";

const SYSTEM_DEMO = { email: "admin@havena.app", password: "password" };

export default function SystemLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (token && isSystemAdminUser(user)) {
      router.replace("/admin/community-admins");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const res = await loginWithEmail(email.trim(), password);
      if (!isSystemAdminUser(res.user)) {
        setError("This sign-in page is for platform administrators only.");
        return;
      }
      setSession(res.token, res.user);
      setRedirecting(true);
      router.replace("/admin/community-admins");
    } catch (err) {
      await handleLoginError(err, setError);
    } finally {
      setLoading(false);
    }
  };

  const isBusy = loading || redirecting;

  return (
    <>
      {redirecting ? (
        <AuthRedirectOverlay title="Opening platform dashboard" subtitle="Loading your workspace…" />
      ) : null}

      <main className="flex min-h-screen min-h-dvh items-center justify-center bg-[#f4f6fb] px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg shadow-slate-200/40">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Internal access</p>
          <h1 className="mt-2 text-[1.75rem] font-bold tracking-tight text-slate-900">
            Platform <em className="not-italic text-blue-600">sign in</em>
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
            For Havena platform operators only.
          </p>

          {error ? (
            <div className="mt-5">
              <AuthErrorBanner message={error} />
            </div>
          ) : null}

          <SystemSignInStep
            email={email}
            password={password}
            showPassword={showPassword}
            onEmailChange={(v) => {
              setEmail(v);
              setError(null);
            }}
            onPasswordChange={(v) => {
              setPassword(v);
              setError(null);
            }}
            onTogglePassword={() => setShowPassword((v) => !v)}
            onSubmit={handleSubmit}
            onDemoFill={() => {
              setEmail(SYSTEM_DEMO.email);
              setPassword(SYSTEM_DEMO.password);
              setError(null);
            }}
            demoLabel={`Try demo · ${SYSTEM_DEMO.email}`}
            loading={loading && !redirecting}
            disabled={isBusy}
          />
        </div>
      </main>
    </>
  );
}
