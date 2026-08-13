"use client";

import { AdminPhoneInput } from "@/components/admin/phone-input";
import { AuthDemoLink, AuthFieldLabel } from "@/components/auth/auth-form-shell";
import { LoadingButton } from "@/components/shared/loaders";
import type { PhoneFieldState } from "@/lib/phone/format";

type PhoneSignInStepProps = {
  phoneValue?: string;
  phoneResetKey?: string | number;
  onPhoneChange: (state: PhoneFieldState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDemoFill?: () => void;
  demoLabel?: string;
  sending?: boolean;
  disabled?: boolean;
  submitLabel?: string;
};

export function PhoneSignInStep({
  phoneValue = "",
  phoneResetKey,
  onPhoneChange,
  onSubmit,
  onDemoFill,
  demoLabel,
  sending = false,
  disabled = false,
  submitLabel = "Continue",
}: PhoneSignInStepProps) {
  return (
    <form onSubmit={onSubmit} className="auth-step-enter mt-5 space-y-5" noValidate>
      <div>
        <AuthFieldLabel htmlFor="community-admin-phone">Phone number</AuthFieldLabel>
        <AdminPhoneInput
          id="community-admin-phone"
          value={phoneValue}
          resetKey={phoneResetKey}
          required
          onChange={onPhoneChange}
        />
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
