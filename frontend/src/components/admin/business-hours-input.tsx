"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useEffect, useState } from "react";
import {
  OPEN_24_HOURS_LABEL,
  buildScheduleHours,
  formatHoursRange,
  isSameScheduleDay,
  parseHoursRange,
  todayIsoDate,
} from "@/lib/admin/hours-range-utils";
import { inputClass } from "@/lib/admin/form-validation-utils";

export type AmenityHoursSchedule = {
  openingDate: string;
  closingDate: string;
  open24Hours: boolean;
};

type BusinessHoursInputProps = {
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  /** Amenity availability uses explicit dates plus an all-day choice. */
  schedule?: AmenityHoursSchedule;
  onScheduleChange?: (next: AmenityHoursSchedule & { hours: string }) => void;
};

/**
 * Open/close time range using the browser native time picker (`input type="time"`).
 * Stores a display string like "6:00 AM – 10:00 PM".
 */
export function BusinessHoursInput({
  value,
  onChange,
  onBlur,
  error,
  schedule,
  onScheduleChange,
}: BusinessHoursInputProps) {
  const parsed = parseHoursRange(value);
  const [open, setOpen] = useState(parsed.open);
  const [close, setClose] = useState(parsed.close);

  useEffect(() => {
    const next = parseHoursRange(value);
    setOpen(next.open);
    setClose(next.close);
  }, [value]);

  const emit = (nextOpen: string, nextClose: string) => {
    onChange?.(formatHoursRange(nextOpen, nextClose));
  };

  const fieldClass = inputClass(error);
  const openingDate = schedule?.openingDate || todayIsoDate();
  const closingDate = schedule?.closingDate || openingDate;
  const open24Hours = Boolean(schedule?.open24Hours);

  const emitSchedule = (
    nextOpen: string,
    nextClose: string,
    nextOpeningDate: string,
    nextClosingDate: string,
    nextOpen24Hours: boolean,
  ) => {
    if (!onScheduleChange) return;
    onScheduleChange({
      openingDate: nextOpeningDate,
      closingDate: nextClosingDate,
      open24Hours: nextOpen24Hours,
      hours: nextOpen24Hours
        ? OPEN_24_HOURS_LABEL
        : buildScheduleHours(nextOpen, nextClose, nextOpeningDate, nextClosingDate),
    });
  };

  if (schedule && onScheduleChange) {
    const sameDay = isSameScheduleDay(openingDate, closingDate);
    return (
      <div className="space-y-3">
        <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-slate-800">Open 24 Hours / All Day</span>
            <span className="text-xs text-slate-500">Use this when the amenity stays open the entire day.</span>
          </span>
          <ClearableInput
            type="checkbox"
            checked={open24Hours}
            onChange={(e) => emitSchedule(open, close, openingDate, closingDate, e.target.checked)}
            onBlur={onBlur}
            className="h-4 w-4 rounded border-slate-300 text-[#1B4F8A]"
          />
        </label>
        <div className={open24Hours ? "pointer-events-none opacity-50" : ""}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Opening date</span>
              <ClearableInput
                type="date"
                value={openingDate}
                disabled={open24Hours}
                onChange={(e) => emitSchedule(open, close, e.target.value, closingDate, false)}
                onBlur={onBlur}
                className={fieldClass}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Opening time</span>
              <ClearableInput
                type="time"
                value={open}
                disabled={open24Hours}
                onChange={(e) => {
                  setOpen(e.target.value);
                  emitSchedule(e.target.value, close, openingDate, closingDate, false);
                }}
                onBlur={onBlur}
                className={fieldClass}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Closing date</span>
              <ClearableInput
                type="date"
                value={closingDate}
                disabled={open24Hours}
                onChange={(e) => emitSchedule(open, close, openingDate, e.target.value, false)}
                onBlur={onBlur}
                className={fieldClass}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Closing time</span>
              <ClearableInput
                type="time"
                value={close}
                disabled={open24Hours}
                onChange={(e) => {
                  setClose(e.target.value);
                  emitSchedule(open, e.target.value, openingDate, closingDate, false);
                }}
                onBlur={onBlur}
                className={fieldClass}
              />
            </div>
          </div>
        </div>
        {error ? null : open24Hours ? (
          <p className="text-xs text-slate-500">Residents will see: <span className="font-medium text-slate-700">Open 24 Hours / All Day</span></p>
        ) : value ? (
          <p className="text-xs text-slate-500">
            Residents will see: <span className="font-medium text-slate-700">{value}</span>
            {open && close && close < open && sameDay ? (
              <span className="block mt-1">Closes the next day (overnight hours).</span>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-slate-400">Set the opening and closing date and time.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col">
          <span className="mb-1.5 text-xs font-semibold text-slate-600">Opens</span>
          <ClearableInput
            type="time"
            value={open}
            onChange={(e) => {
              setOpen(e.target.value);
              emit(e.target.value, close);
            }}
            onBlur={onBlur}
            className={fieldClass}
          />
        </div>
        <span className="pb-3 text-sm text-slate-400">to</span>
        <div className="flex flex-1 flex-col">
          <span className="mb-1.5 text-xs font-semibold text-slate-600">Closes</span>
          <ClearableInput
            type="time"
            value={close}
            onChange={(e) => {
              setClose(e.target.value);
              emit(open, e.target.value);
            }}
            onBlur={onBlur}
            className={fieldClass}
          />
        </div>
      </div>
      {value ? (
        <p className="text-xs text-slate-500">
          Residents will see: <span className="font-medium text-slate-700">{value}</span>
          {open && close && close < open ? (
            <span className="block mt-1">Closes the next day (overnight hours).</span>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-slate-400">Use the time pickers to set opening and closing hours.</p>
      )}
    </div>
  );
}
