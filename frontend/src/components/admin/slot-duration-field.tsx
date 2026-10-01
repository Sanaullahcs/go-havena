"use client";

import {
  AMENITY_SLOT_MAX_MINUTES,
  AMENITY_SLOT_MIN_MINUTES,
  combineSlotDurationMinutes,
  isPresetSlotDurationMinutes,
  PRESET_SLOT_DURATION_OPTIONS,
  splitSlotDurationMinutes,
} from "@/lib/admin/amenity-slot-duration";
import { inputClass } from "@/lib/admin/form-validation-utils";

type SlotDurationFieldProps = {
  minutes: string;
  onChangeMinutes: (minutes: string) => void;
  error?: string | null;
  onBlur?: () => void;
};

export function SlotDurationField({
  minutes,
  onChangeMinutes,
  error,
  onBlur,
}: SlotDurationFieldProps) {
  const total = Number(minutes) || 0;
  const custom = !isPresetSlotDurationMinutes(total);
  const { hours, minutes: mins } = splitSlotDurationMinutes(total);
  const hoursDisplay = total === 0 ? "" : hours > 0 ? String(hours) : "";
  const minutesDisplay = total === 0 ? "" : mins > 0 ? String(mins) : "";

  const chipClass = (active: boolean) =>
    [
      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
      active
        ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
    ].join(" ");

  const setCustomParts = (nextHours: string, nextMinutes: string) => {
    const combined = combineSlotDurationMinutes(nextHours, nextMinutes);
    onChangeMinutes(String(combined));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PRESET_SLOT_DURATION_OPTIONS.map((opt) => (
          <button
            key={opt.minutes}
            type="button"
            onClick={() => onChangeMinutes(String(opt.minutes))}
            className={chipClass(!custom && total === opt.minutes)}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (!custom) onChangeMinutes("180");
          }}
          className={chipClass(custom)}
        >
          Custom
        </button>
      </div>

      {custom ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Hours</label>
            <input
              type="number"
              min={0}
              max={Math.floor(AMENITY_SLOT_MAX_MINUTES / 60)}
              inputMode="numeric"
              className={inputClass(Boolean(error))}
              value={hoursDisplay}
              onChange={(e) => setCustomParts(e.target.value, String(mins))}
              onBlur={onBlur}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Minutes</label>
            <input
              type="number"
              min={0}
              max={59}
              inputMode="numeric"
              className={inputClass(Boolean(error))}
              value={minutesDisplay}
              onChange={(e) => setCustomParts(String(hours), e.target.value)}
              onBlur={onBlur}
              placeholder="0"
            />
          </div>
          <p className="col-span-2 text-[11px] text-slate-400">
            {AMENITY_SLOT_MIN_MINUTES}–{AMENITY_SLOT_MAX_MINUTES} minutes total (up to 8 hours).
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
