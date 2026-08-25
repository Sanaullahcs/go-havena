"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  verifyLabel?: string;
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
  verifyLabel = "Continue",
}: OtpVerifyStepProps) {
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const verifyOnce = useRef(false);
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

  useEffect(() => {
    if (!verifying) verifyOnce.current = false;
  }, [verifying]);

  const runVerify = useCallback(
    (code: string) => {
      if (sending || busy || verifyOnce.current || code.length !== 6) return;
      verifyOnce.current = true;
      onVerify(code);
    },
    [busy, onVerify, sending],
  );

  const handleComplete = useCallback(
    (code: string) => {
      runVerify(code);
    },
    [runVerify],
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
          <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-[13px] text-slate-600">
            Code sent to{" "}
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
            Dev · <span className="font-mono text-slate-500">221322</span>
          </p>
        </>
      )}

      <LoadingButton
        type="button"
        onClick={() => runVerify(otp)}
        disabled={otp.length !== 6 || sending || busy}
        loading={verifying}
        loadingText="Verifying…"
        className="nl-auth-btn nl-auth-btn--arrow w-full py-3"
      >
        {verifyLabel}
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
          <button type="button" onClick={handleResend} className="font-semibold text-teal-700 hover:text-teal-800">
            Resend code
          </button>
        )}
      </p>
    </div>
  );
}
