"use client";

import type { ReactNode } from "react";

const ACCENT = "#1B4F8A";

type Props = {
  /** Large hero line (e.g. 404). Omit for offline-style screens. */
  code?: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  icon?: ReactNode;
  className?: string;
};

/** Centered empty / error layout — large code, title, copy, single CTA. */
export function MinimalStatusCenter({
  code,
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className = "",
}: Props) {
  return (
    <div
      className={[
        "flex w-full flex-col items-center justify-center px-6 py-12 text-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {code ? (
        <p
          className="text-[4.5rem] font-bold leading-none tracking-tight sm:text-[5.5rem]"
          style={{ color: ACCENT }}
          aria-hidden={Boolean(icon)}
        >
          {code}
        </p>
      ) : null}
      <h1
        className={[
          "text-[1.25rem] font-semibold text-slate-800 sm:text-[1.35rem]",
          code ? "mt-5" : icon ? "mt-4" : "mt-0",
        ].join(" ")}
      >
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-slate-500">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-9 rounded-md bg-[#1B4F8A] px-10 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#163A66] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B4F8A]"
      >
        {actionLabel}
      </button>
    </div>
  );
}