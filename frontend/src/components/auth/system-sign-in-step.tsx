"use client";

import { useEffect, useRef } from "react";
import {
  AuthDemoLink,
  AuthFieldLabel,
  AuthInputWrap,
} from "@/components/auth/auth-form-shell";
import { LoadingButton } from "@/components/shared/loaders";

type SystemSignInStepProps = {
  email: string;
  password: string;
  showPassword: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onDemoFill: () => void;
  demoLabel: string;
  loading?: boolean;
  disabled?: boolean;
};

export function SystemSignInStep({
  email,
  password,
  showPassword,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
  onDemoFill,
  demoLabel,
  loading = false,
  disabled = false,
}: SystemSignInStepProps) {
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  return (
    <form onSubmit={onSubmit} className="auth-step-enter mt-5 space-y-5" noValidate>
      <div>
        <AuthFieldLabel htmlFor="admin-email">Email</AuthFieldLabel>
        <AuthInputWrap
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v9A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-9z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M5 8l7 5 7-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          }
        >
          <input
            ref={emailRef}
            id="admin-email"
            type="email"
            autoComplete="username"
            placeholder="admin@havena.app"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="nl-auth-input w-full !pl-10"
          />
        </AuthInputWrap>
      </div>

      <div>
        <AuthFieldLabel htmlFor="admin-password">Password</AuthFieldLabel>
        <AuthInputWrap
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          }
        >
          <input
            id="admin-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="nl-auth-input w-full !pl-10 !pr-14"
          />
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 z-20 -translate-y-1/2 text-[11px] font-semibold text-slate-400 hover:text-slate-600"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </AuthInputWrap>
      </div>

      <LoadingButton
        type="submit"
        disabled={disabled}
        loading={loading}
        loadingText="Signing in…"
        className="nl-auth-btn nl-auth-btn--arrow w-full py-3"
      >
        Sign In
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </LoadingButton>

      <AuthDemoLink label={demoLabel} onClick={onDemoFill} />
    </form>
  );
}
