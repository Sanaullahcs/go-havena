"use client";

import { useCallback, useEffect, useRef } from "react";

export type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  onComplete?: (value: string) => void;
};

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  error = false,
  autoFocus = false,
  onComplete,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const completedRef = useRef<string | null>(null);
  const digits = value.replace(/\D/g, "").slice(0, length).split("");
  const activeIndex = Math.min(digits.length, length - 1);

  const focusInput = useCallback(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    if (autoFocus) focusInput();
  }, [autoFocus, focusInput]);

  useEffect(() => {
    const code = value.replace(/\D/g, "").slice(0, length);
    if (code.length < length) {
      completedRef.current = null;
      return;
    }
    if (onComplete && completedRef.current !== code) {
      completedRef.current = code;
      onComplete(code);
    }
  }, [value, length, onComplete]);

  const handleChange = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, length);
    onChange(next);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        value={value}
        disabled={disabled}
        aria-label={`${length}-digit verification code`}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => focusInput()}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />

      <div
        className="grid grid-cols-6 gap-2 sm:gap-2.5"
        onClick={focusInput}
        role="group"
        aria-hidden
      >
        {Array.from({ length }).map((_, i) => {
          const filled = Boolean(digits[i]);
          const isActive = !disabled && i === activeIndex && digits.length < length;

          return (
            <div
              key={i}
              className={[
                "relative flex h-[3.25rem] items-center justify-center rounded-xl border-2 bg-white text-xl font-bold tabular-nums tracking-tight transition-all duration-200 sm:h-[3.5rem] sm:text-2xl",
                error
                  ? "border-red-300 bg-red-50/40 text-red-700"
                  : filled
                    ? "border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm shadow-blue-500/10"
                    : isActive
                      ? "border-blue-400 bg-white text-slate-900 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
                      : "border-slate-200 text-slate-400",
                disabled ? "opacity-60" : "",
              ].join(" ")}
            >
              {filled ? digits[i] : isActive ? <span className="otp-caret" /> : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
