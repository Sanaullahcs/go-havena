"use client";

import { useCallback, useEffect, useState } from "react";
import { OtpInput } from "@/components/auth/otp-input";
import { LoadingButton, InlineLoader } from "@/components/shared/loaders";
import { formatPhoneDisplay } from "@/lib/phone/format";

type OtpVerifyStepProps = {
  phoneE164: string;
  otp: string;
  onOtpChange: (value: string) => void;
  onVerify: (code: string) => void | Promise<void>;
  onResend: () => void | Promise<void>;
  sending?: boolean;
  verifying?: boolean;
  error?: boolean;
};

const RESEND_SECONDS = 30;

export function OtpVerifyStep({
  phoneE164,
  otp,
  onOtpChange,
  onVerify,
  onResend,
  sending = false,
  verifying = false,
  error = false,
}: OtpVerifyStepProps) {
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const busy = verifying || resending;

  useEffect(() => {
    if (sending) return;
    setResendIn(RESEND_SECONDS);
  }, [sending, phoneE164]);

  useEffect(() => {
    if (sending || resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn, sending]);

  const handleComplete = useCallback(
    (code: string) => {
      if (!sending && !busy) onVerify(code);
    },
    [busy, onVerify, sending],
  );

  const handleResend = async () => {
    if (resendIn > 0 || resending || sending) return;
    setResending(true);
    try {
      await onResend();
      setResendIn(RESEND_SECONDS);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-step-enter mt-5 space-y-5">
      {sending ? (
        <InlineLoader text={`Sending to ${formatPhoneDisplay(phoneE164)}…`} />
      ) : (
        <>
          <p className="text-[14px] text-slate-600">
            Enter the code sent to{" "}
            <span className="font-semibold text-slate-900">{formatPhoneDisplay(phoneE164)}</span>
          </p>
          <OtpInput
            value={otp}
            onChange={onOtpChange}
            disabled={busy}
            error={error}
            autoFocus
            onComplete={handleComplete}
          />
          <p className="text-center text-[11px] text-slate-400">
            Dev · <span className="font-mono text-slate-500">123456</span>
          </p>
        </>
      )}

      <LoadingButton
        type="button"
        onClick={() => onVerify(otp)}
        disabled={otp.length !== 6 || sending || busy}
        loading={verifying}
        loadingText="Verifying…"
        className="nl-auth-btn nl-auth-btn--arrow w-full py-3"
      >
        Sign In
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </LoadingButton>

      <p className="text-center text-[12px] text-slate-400">
        {resending ? (
          "Sending…"
        ) : resendIn > 0 ? (
          `Resend available in ${resendIn}s`
        ) : (
          <button type="button" onClick={handleResend} className="font-semibold text-blue-600 hover:text-blue-700">
            Resend code
          </button>
        )}
      </p>
    </div>
  );
}
