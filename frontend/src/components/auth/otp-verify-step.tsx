"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OtpInput } from "@/components/auth/otp-input";
import { LoadingButton, InlineLoader } from "@/components/shared/loaders";
import {
  formatOtpCountdown,
  OTP_EXPIRE_MINUTES,
  OTP_RESEND_SECONDS,
} from "@/lib/auth/otp-config";

type OtpVerifyStepProps = {
  destination: string;
  otp: string;
  onOtpChange: (value: string) => void;
  onVerify: (code: string) => void | Promise<void>;
  onResend: () => void | Promise<void>;
  sending?: boolean;
  verifying?: boolean;
  error?: boolean;
  verifyLabel?: string;
};

const RESEND_NOTICE_MS = 2500;

export function OtpVerifyStep({
  destination,
  otp,
  onOtpChange,
  onVerify,
  onResend,
  sending = false,
  verifying = false,
  error = false,
  verifyLabel = "Continue",
}: OtpVerifyStepProps) {
  const [resendIn, setResendIn] = useState(OTP_RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState(false);
  const verifyOnce = useRef(false);
  const noticeTimer = useRef<number | null>(null);
  const busy = verifying || resending;
  const canResend = resendIn <= 0 && !resending && !sending;

  useEffect(() => {
    if (sending) return;
    setResendIn(OTP_RESEND_SECONDS);
    setResendNotice(false);
  }, [sending, destination]);

  useEffect(() => {
    if (sending || resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn, sending]);

  useEffect(() => {
    if (!verifying) verifyOnce.current = false;
  }, [verifying]);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) {
        window.clearTimeout(noticeTimer.current);
      }
    },
    [],
  );

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
    if (!canResend) return;
    setResending(true);
    setResendNotice(false);
    try {
      await onResend();
      setResendIn(OTP_RESEND_SECONDS);
      setResendNotice(true);
      if (noticeTimer.current !== null) {
        window.clearTimeout(noticeTimer.current);
      }
      noticeTimer.current = window.setTimeout(() => {
        setResendNotice(false);
        noticeTimer.current = null;
      }, RESEND_NOTICE_MS);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-step-enter mt-5 space-y-5">
      {sending ? (
        <InlineLoader text={`Sending to ${destination}…`} />
      ) : (
        <>
          <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-2.5 text-[13px] text-slate-600">
            Code sent to{" "}
            <span className="font-semibold text-slate-900">{destination}</span>
          </p>
          <OtpInput
            value={otp}
            onChange={onOtpChange}
            disabled={busy}
            error={error}
            autoFocus
            onComplete={handleComplete}
          />
          {process.env.NODE_ENV === "development" ? (
            <p className="text-center text-[11px] text-slate-400">
              Dev · <span className="font-mono text-slate-500">123456</span>
            </p>
          ) : null}
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

      <div className="space-y-2 text-center">
        <p className="text-[12px] text-slate-500">
          This code will expire in {OTP_EXPIRE_MINUTES} minutes
        </p>
        {resendNotice ? (
          <p className="text-[12px] font-medium text-emerald-600">New code sent</p>
        ) : resending ? (
          <p className="text-[12px] text-slate-400">Sending…</p>
        ) : canResend ? (
          <button
            type="button"
            onClick={handleResend}
            className="text-[12px] font-semibold text-teal-700 hover:text-teal-800"
          >
            Resend code
          </button>
        ) : (
          <p className="text-[12px] text-slate-400">
            Resend available in{" "}
            <span className="font-semibold text-teal-700">{formatOtpCountdown(resendIn)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
