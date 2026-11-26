"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type AuthMode = "community" | "system";

export function AuthModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="auth-mode-switch"
      data-active={mode}
      role="tablist"
      aria-label="Sign in method"
    >
      <span className="auth-mode-switch__slider" aria-hidden />
      {(
        [
          { id: "community" as const, label: "Community admin" },
          { id: "system" as const, label: "System admin" },
        ] as const
      ).map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={mode === tab.id}
          disabled={disabled}
          onClick={() => onChange(tab.id)}
          className="auth-mode-switch__tab"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export type LoginPortalKind = "community_admin" | "landlord";

export function LoginPortalTabs({
  active,
  onChange,
  disabled,
}: {
  active: LoginPortalKind;
  onChange: (portal: LoginPortalKind) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="auth-mode-switch mb-4"
      data-active={active === "landlord" ? "landlord" : "community"}
      role="tablist"
      aria-label="Sign in as"
    >
      <span className="auth-mode-switch__slider" aria-hidden />
      <button
        type="button"
        role="tab"
        aria-selected={active === "community_admin"}
        disabled={disabled}
        onClick={() => onChange("community_admin")}
        className="auth-mode-switch__tab"
      >
        Community admin
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "landlord"}
        disabled={disabled}
        onClick={() => onChange("landlord")}
        className="auth-mode-switch__tab"
      >
        Landlord
      </button>
    </div>
  );
}

export function CommunityAuthTabs({
  active,
  query = "",
}: {
  active: "login" | "register";
  query?: string;
}) {
  const suffix = !query || query.startsWith("?") ? query : `?${query}`;

  return (
    <div
      className="auth-mode-switch mb-6"
      data-active={active}
      role="tablist"
      aria-label="Login or register"
    >
      <span className="auth-mode-switch__slider" aria-hidden />
      <Link
        href={`/login${suffix}`}
        role="tab"
        aria-selected={active === "login"}
        className="auth-mode-switch__tab no-underline"
      >
        Login
      </Link>
      <Link
        href={`/register${suffix}`}
        role="tab"
        aria-selected={active === "register"}
        className="auth-mode-switch__tab no-underline"
      >
        Register
      </Link>
    </div>
  );
}

export function AuthStepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="auth-step-dots" aria-label={`Step ${step} of 2`}>
      <span className={`auth-step-dots__dot ${step >= 1 ? (step === 1 ? "auth-step-dots__dot--active" : "auth-step-dots__dot--done") : ""}`} />
      <span className={`auth-step-dots__dot ${step === 2 ? "auth-step-dots__dot--active" : ""}`} />
    </div>
  );
}

export function AuthFieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-slate-700">
      {children}
    </label>
  );
}

export function AuthInputWrap({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400">{icon}</span>
      {children}
    </div>
  );
}

export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <p className="auth-error-enter rounded-xl border border-red-100 bg-red-50/90 px-3.5 py-2.5 text-[13px] leading-relaxed text-red-600" role="alert">
      {message}
    </p>
  );
}

export function AuthDemoLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-center text-[12px] text-slate-400 transition hover:text-blue-600"
    >
      <span className="border-b border-transparent transition group-hover:border-blue-200">{label}</span>
    </button>
  );
}

const authBackLinkClass =
  "inline-flex items-center gap-1.5 text-[13px] font-medium transition";

const authBackVariants = {
  link: "text-slate-500 hover:text-blue-600",
  button:
    "rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 shadow-sm hover:border-slate-300 hover:text-blue-600 lg:hidden",
  hero:
    "hidden rounded-full border border-white/25 bg-white/10 px-3.5 py-2 font-semibold text-white/90 backdrop-blur-sm hover:border-white/40 hover:bg-white/15 hover:text-white lg:inline-flex",
};

function AuthBackChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AuthBackLink({
  onClick,
  href,
  children,
  className = "",
  variant = "link",
}: {
  onClick?: () => void;
  href?: string;
  children: ReactNode;
  className?: string;
  variant?: "link" | "button" | "hero";
}) {
  const classes = `${authBackLinkClass} ${authBackVariants[variant]} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={classes}>
        <AuthBackChevron />
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`mb-4 ${classes}`}>
      <AuthBackChevron />
      {children}
    </button>
  );
}
