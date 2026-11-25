"use client";

import { groupedCatalog, type ResidentFeatureItem } from "@/lib/resident-features";

export function ResidentFeatureToggles({
  catalog,
  values,
  onChange,
  disabled,
  reasons,
  onReasonChange,
}: {
  catalog: ResidentFeatureItem[];
  values: Record<string, boolean>;
  onChange: (key: string, enabled: boolean) => void;
  disabled?: boolean;
  reasons?: Record<string, string>;
  onReasonChange?: (key: string, reason: string) => void;
}) {
  const groups = groupedCatalog(catalog);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.group} className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {group.group_label}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {group.features.map((feature) => {
              const enabled = values[feature.key] !== false;
              return (
                <div
                  key={feature.key}
                  className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                <label className="flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-slate-900">{feature.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
                      {feature.description}
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={feature.label}
                    disabled={disabled}
                    onClick={() => onChange(feature.key, !enabled)}
                    className={[
                      "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition",
                      enabled ? "bg-emerald-600" : "bg-slate-300",
                      disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                        enabled ? "left-5" : "left-0.5",
                      ].join(" ")}
                    />
                  </button>
                </label>
                {onReasonChange && !enabled ? (
                  <textarea
                    value={reasons?.[feature.key] ?? ""}
                    onChange={(event) => onReasonChange(feature.key, event.target.value)}
                    rows={3}
                    maxLength={1000}
                    disabled={disabled}
                    placeholder="Reason for disabling this feature"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1B4F8A]"
                  />
                ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
