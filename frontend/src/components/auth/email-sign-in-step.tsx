"use client";

import { AuthDemoLink, AuthFieldLabel } from "@/components/auth/auth-form-shell";
import { LoadingButton } from "@/components/shared/loaders";

type EmailSignInStepProps = {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onDemoFill?: () => void;
  demoLabel?: string;
  sending?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  error?: string | null;
};

export function EmailSignInStep({
  email,
  onEmailChange,
  onSubmit,
  onFocus,
  onBlur,
  onDemoFill,
  demoLabel,
  sending = false,
  disabled = false,
  submitLabel = "Continue",
  error = null,
}: EmailSignInStepProps) {
  return (
    <form onSubmit={onSubmit} className="auth-step-enter mt-5 space-y-5" noValidate>
      <div>
        <AuthFieldLabel htmlFor="community-admin-email">Email address</AuthFieldLabel>
        <input
          id="community-admin-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          required
          aria-invalid={Boolean(error)}
          onChange={(e) => onEmailChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="you@example.com"
          className="nl-input w-full"
          style={error ? { borderColor: "#DC2626" } : undefined}
        />
        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <LoadingButton
        type="submit"
        disabled={disabled}
        loading={sending}
        loadingText="Sending code…"
        className="nl-auth-btn nl-auth-btn--arrow w-full py-3"
      >
        {submitLabel}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </LoadingButton>

      {onDemoFill && demoLabel ? <AuthDemoLink label={demoLabel} onClick={onDemoFill} /> : null}
    </form>
  );
}
