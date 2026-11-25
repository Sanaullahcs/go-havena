"use client";

import { useId, useMemo } from "react";
import { Check, Clock } from "lucide-react";
import {
  DEFAULT_POLL_DURATION,
  POLL_DAY_PRESETS,
  POLL_HOUR_PRESETS,
  POLL_MAX_DAYS,
  POLL_MAX_HOURS,
  type PollDurationSelection,
  type PollDurationUnit,
  clampPollCustomValue,
  pollDurationLabel,
} from "@/lib/poll-duration";

function presetsForUnit(unit: PollDurationUnit) {
  return unit === "hours" ? POLL_HOUR_PRESETS : POLL_DAY_PRESETS;
}

function isSelected(selection: PollDurationSelection, unit: PollDurationUnit, value: number) {
  return (
    selection.unit === unit &&
    selection.kind === "preset" &&
    selection.value === value
  );
}

function isCustomSelected(selection: PollDurationSelection, unit: PollDurationUnit) {
  return selection.unit === unit && selection.kind === "custom";
}

export function PollDurationPicker({
  value,
  onChange,
  disabled = false,
  required = false,
  className = "",
}: {
  value: PollDurationSelection;
  onChange: (next: PollDurationSelection) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const customId = useId();
  const unit = value.unit;
  const presets = useMemo(() => presetsForUnit(unit), [unit]);

  const setUnit = (nextUnit: PollDurationUnit) => {
    if (nextUnit === value.unit) return;
    const first = presetsForUnit(nextUnit)[0];
    onChange({ unit: nextUnit, kind: "preset", value: first });
  };

  return (
    <div className={`nl-notice-field ${className}`.trim()}>
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="nl-notice-label">
            Poll duration
            {required ? <span className="text-red-500"> *</span> : null}
          </p>
          <p className="nl-notice-schedule-hint">Choose how long residents can vote.</p>
        </div>
      </div>

      <div
        className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-100/80 p-0.5"
        role="tablist"
        aria-label="Poll duration unit"
      >
        {(["hours", "days"] as const).map((tab) => {
          const active = unit === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => setUnit(tab)}
              className={[
                "nl-schedule-chip min-w-[5.5rem] capitalize disabled:opacity-60",
                active ? "nl-schedule-chip--active" : "",
              ].join(" ")}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {presets.map((preset) => {
          const active = isSelected(value, unit, preset);
          return (
            <button
              key={`${unit}-${preset}`}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ unit, kind: "preset", value: preset })}
              className={[
                "relative flex min-h-[3.25rem] flex-col items-center justify-center rounded-2xl border px-2 py-2.5 text-center transition disabled:opacity-60",
                active
                  ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
                  : "border-slate-200 bg-white text-[#0A2A43] hover:border-slate-300",
              ].join(" ")}
            >
              <span className="nl-notice-option-title">{pollDurationLabel(unit, preset)}</span>
              {active ? (
                <Check className="mt-1 h-3.5 w-3.5 text-[#1B4F8A]" strokeWidth={2.5} aria-hidden />
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              unit,
              kind: "custom",
              value: value.unit === unit && value.kind === "custom" ? value.value : presets[0],
            })
          }
          className={[
            "relative flex min-h-[3.25rem] flex-col items-center justify-center rounded-2xl border px-2 py-2.5 text-center transition disabled:opacity-60",
            isCustomSelected(value, unit)
              ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
              : "border-slate-200 bg-white text-[#0A2A43] hover:border-slate-300",
          ].join(" ")}
        >
          <span className="nl-notice-option-title">Custom</span>
          {isCustomSelected(value, unit) ? (
            <Check className="mt-1 h-3.5 w-3.5 text-[#1B4F8A]" strokeWidth={2.5} aria-hidden />
          ) : null}
        </button>
      </div>

      {value.kind === "custom" ? (
        <div className="nl-notice-picker-field mt-3">
          <label htmlFor={customId} className="nl-notice-picker-label">
            Custom {unit === "hours" ? "hours" : "days"}
          </label>
          <input
            id={customId}
            type="number"
            min={1}
            max={unit === "hours" ? POLL_MAX_HOURS : POLL_MAX_DAYS}
            disabled={disabled}
            value={value.value}
            onChange={(e) =>
              onChange({
                unit: value.unit,
                kind: "custom",
                value: clampPollCustomValue(value.unit, Number(e.target.value)),
              })
            }
            className="nl-input w-full"
          />
          <p className="nl-notice-schedule-note">
            {unit === "hours" ? `Between 1 and ${POLL_MAX_HOURS} hours.` : `Between 1 and ${POLL_MAX_DAYS} days.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export { DEFAULT_POLL_DURATION };