"use client";

import { HavenaMark } from "@/components/shared/havena-mark";

type Tone = "dark" | "light";

/**
 * Official Havena lockup — infinity mark + Quicksand wordmark.
 * Use this anywhere a header / auth / marketing logo is shown.
 */
export function HavenaLockup({
  size = 44,
  label,
  tone = "dark",
  boxed = false,
  hideNameOnMobile = false,
  className = "",
  nameClassName = "",
}: {
  size?: number;
  label?: string;
  tone?: Tone;
  boxed?: boolean;
  hideNameOnMobile?: boolean;
  className?: string;
  nameClassName?: string;
}) {
  const nameColor = tone === "light" ? "text-white" : "text-[#0A2A43]";
  const labelColor = tone === "light" ? "text-white/65" : "text-[rgba(10,42,67,0.45)]";
  const mark = <HavenaMark size={size} tight={!boxed} />;

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`.trim()}>
      {boxed ? <span className="nl-login-brand__mark">{mark}</span> : mark}
      <span
        className={`min-w-0 flex-col justify-center ${
          hideNameOnMobile ? "hidden sm:flex" : "flex"
        }`}
      >
        <span
          className={`font-[family-name:var(--font-wordmark)] font-bold leading-none tracking-[-0.02em] ${nameColor} ${
            nameClassName || "text-[1.75rem]"
          }`.trim()}
        >
          Havena
        </span>
        {label ? (
          <span className={`mt-1 text-[11.5px] font-medium leading-none ${labelColor}`}>
            {label}
          </span>
        ) : null}
      </span>
    </span>
  );
}
