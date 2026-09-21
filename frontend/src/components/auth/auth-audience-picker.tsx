"use client";

import type { AuthAudience } from "@/lib/auth/resolve-destination";

const OPTIONS: Array<{
  id: AuthAudience;
  title: string;
  subtitle: string;
}> = [
  {
    id: "resident",
    title: "Resident",
    subtitle: "Join your community with an invite code",
  },
  {
    id: "admin",
    title: "Community admin",
    subtitle: "Create or manage a community",
  },
];

export function AuthAudiencePicker({
  value,
  onChange,
  disabled,
}: {
  value: AuthAudience;
  onChange: (next: AuthAudience) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Account type">
      {OPTIONS.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={[
              "rounded-xl border px-3 py-2.5 text-left transition",
              active
                ? "border-teal-300 bg-teal-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
              disabled ? "cursor-not-allowed opacity-60" : "",
            ].join(" ")}
          >
            <p
              className={[
                "text-[13px] font-semibold",
                active ? "text-teal-800" : "text-slate-800",
              ].join(" ")}
            >
              {option.title}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{option.subtitle}</p>
          </button>
        );
      })}
    </div>
  );
}
