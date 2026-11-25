import type { ReactNode } from "react";
import { COMMUNITY_ADMIN_ONBOARDING_STEPS } from "@/lib/admin/community-admin-onboarding";

export function OnboardingProgress({
  current,
  embedded = false,
}: {
  current: number;
  embedded?: boolean;
}) {
  const total = COMMUNITY_ADMIN_ONBOARDING_STEPS.length;
  const activeStep = COMMUNITY_ADMIN_ONBOARDING_STEPS.find((s) => s.id === current);

  return (
    <nav
      aria-label="Setup progress"
      className={[
        "flex min-w-0 w-full items-center justify-between",
        embedded ? "h-full gap-1.5 py-px" : "gap-2 border-b border-slate-200/90 pb-2.5 sm:gap-3",
      ].join(" ")}
    >
      <p className="min-w-0 flex-1 truncate text-[10px] leading-normal text-slate-600 sm:text-[11px]">
        <span className="font-bold text-teal-700 sm:hidden">{current}/{total}</span>
        <span className="hidden font-bold uppercase tracking-[0.08em] text-teal-700 sm:inline">
          Step {current} of {total}
        </span>
        {activeStep ? (
          <span className="hidden font-medium text-slate-500 sm:inline"> · {activeStep.label}</span>
        ) : null}
      </p>

      <ol
        className="flex shrink-0 items-center gap-0.5 py-px sm:gap-1"
        aria-label={`Step ${current} of ${total}`}
      >
        {COMMUNITY_ADMIN_ONBOARDING_STEPS.map((step, index) => {
          const done = step.id < current;
          const active = step.id === current;
          const isLast = index === COMMUNITY_ADMIN_ONBOARDING_STEPS.length - 1;

          return (
            <li
              key={step.id}
              className="flex items-center"
              aria-current={active ? "step" : undefined}
              title={step.label}
            >
              <span
                className={[
                  "box-border flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold transition-colors sm:h-6 sm:w-6 sm:text-[10px]",
                  done
                    ? "bg-teal-600 text-white"
                    : active
                      ? "border-2 border-teal-500 bg-teal-50 text-teal-700"
                      : "bg-slate-100 text-slate-400",
                ].join(" ")}
                aria-hidden
              >
                {done ? "✓" : step.id}
              </span>
              {!isLast ? (
                <span
                  className={[
                    "mx-0.5 h-px w-1.5 sm:w-2.5",
                    done ? "bg-teal-400" : "bg-slate-200",
                  ].join(" ")}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function OnboardingField({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 max-w-full">
      <div className="mb-1.5">
        <label htmlFor={id} className="block text-sm font-semibold leading-tight text-slate-700">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>
        {hint ? <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{hint}</p> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[12px] font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
