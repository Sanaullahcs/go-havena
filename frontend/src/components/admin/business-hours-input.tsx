"use client";

import { useEffect, useState } from "react";
import { formatHoursRange, parseHoursRange } from "@/lib/admin/hours-range-utils";
import { inputClass } from "@/lib/admin/form-validation-utils";

type BusinessHoursInputProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
};

/**
 * Open/close time range using the browser native time picker (`input type="time"`).
 * Stores a display string like "6:00 AM – 10:00 PM".
 */
export function BusinessHoursInput({ value, onChange, onBlur, error }: BusinessHoursInputProps) {
  const parsed = parseHoursRange(value);
  const [open, setOpen] = useState(parsed.open);
  const [close, setClose] = useState(parsed.close);

  useEffect(() => {
    const next = parseHoursRange(value);
    setOpen(next.open);
    setClose(next.close);
  }, [value]);

  const emit = (nextOpen: string, nextClose: string) => {
    onChange(formatHoursRange(nextOpen, nextClose));
  };

  const fieldClass = inputClass(error);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col">
          <span className="mb-1.5 text-xs font-semibold text-slate-600">Opens</span>
          <input
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
          <input
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
          {open && close && close <= open ? (
            <span className="block mt-1">Closes the next day (overnight hours).</span>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-slate-400">Use the time pickers to set opening and closing hours.</p>
      )}
    </div>
  );
}
