"use client";

import type { AmenitySlot } from "@/lib/api/amenities";

type Slot = AmenitySlot & { available?: boolean };

export function AmenitySlotPicker({
  loading,
  slots,
  message,
  selected,
  onSelect,
  tone = "navy",
  fullSlot = false,
}: {
  loading: boolean;
  slots: Slot[];
  message?: string | null;
  selected: string;
  onSelect: (value: string) => void;
  tone?: "navy" | "teal";
  fullSlot?: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-busy="true" aria-label="Loading time slots">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-10 animate-skeleton rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (message) {
    return (
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3" role="status">
        <p className="text-sm font-semibold text-amber-950">Times unavailable</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900">{message}</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3.5 py-4 text-center" role="status">
        <p className="text-sm font-semibold text-slate-800">No open slots</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Nothing is bookable on this date. Choose another day.
        </p>
      </div>
    );
  }

  const activeClass =
    tone === "teal"
      ? "border-teal-500 bg-teal-50 text-[#0A2A43]"
      : "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]";

  return (
    <div className="mt-2 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
      {slots.map((item) => {
        const taken = item.available === false;
        const active = selected === item.value;
        const label = item.value || item.label;
        return (
          <button
            key={item.value || label}
            type="button"
            disabled={taken}
            onClick={() => onSelect(item.value)}
            className={[
              "rounded-xl border px-3 py-2 text-left text-[12.5px] font-semibold transition",
              taken
                ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                : active
                  ? activeClass
                  : "border-slate-200 text-slate-700 hover:border-slate-300",
            ].join(" ")}
          >
            {label}
            {taken
              ? " · Full"
              : item.remaining != null
                ? fullSlot
                  ? " · Available"
                  : ` · ${item.remaining} left`
                : ""}
          </button>
        );
      })}
    </div>
  );
}
