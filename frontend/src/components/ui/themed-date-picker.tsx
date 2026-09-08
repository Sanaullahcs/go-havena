"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parseIso(iso: string) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayParts() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

function formatDisplay(iso: string) {
  const parts = parseIso(iso);
  if (!parts) return "";
  return new Date(parts.y, parts.m, parts.d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMonthGrid(y: number, m: number) {
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();
  const cells: { day: number; monthOffset: -1 | 0 | 1 }[] = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    cells.push({ day: daysInPrev - i, monthOffset: -1 });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ day: d, monthOffset: 0 });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay, monthOffset: 1 });
    nextDay += 1;
  }
  return cells;
}

function shiftMonth(y: number, m: number, delta: number) {
  const next = new Date(y, m + delta, 1);
  return { y: next.getFullYear(), m: next.getMonth() };
}

function usePopoverDismiss(
  open: boolean,
  onClose: () => void,
  anchorRef: RefObject<HTMLElement | null>,
  popoverRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (popoverRef?.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose, anchorRef, popoverRef]);
}

type ThemedDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string;
  placeholder?: string;
  fieldKey?: string;
  error?: string;
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function ThemedDatePicker({
  value,
  onChange,
  onBlur,
  label,
  placeholder = "Select date",
  fieldKey,
  error,
  icon,
  className = "",
  compact = false,
}: ThemedDatePickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { style: popoverStyle } = useAnchoredPopover(open, triggerRef, {
    popoverRef,
    width: 296,
  });
  const initial = parseIso(value) ?? todayParts();
  const [viewYear, setViewYear] = useState(initial.y);
  const [viewMonth, setViewMonth] = useState(initial.m);

  usePopoverDismiss(open, () => {
    setOpen(false);
    onBlur?.();
  }, wrapRef, popoverRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const parts = parseIso(value);
    if (parts) {
      setViewYear(parts.y);
      setViewMonth(parts.m);
    }
  }, [value]);

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = todayParts();
  const hasValue = Boolean(value);

  const pickDay = (day: number, monthOffset: -1 | 0 | 1) => {
    const shifted = shiftMonth(viewYear, viewMonth, monthOffset);
    const iso = toIso(shifted.y, shifted.m, day);
    onChange(iso);
    setViewYear(shifted.y);
    setViewMonth(shifted.m);
    setOpen(false);
    onBlur?.();
  };

  const goToday = () => {
    const iso = toIso(today.y, today.m, today.d);
    onChange(iso);
    setViewYear(today.y);
    setViewMonth(today.m);
    setOpen(false);
    onBlur?.();
  };

  const clear = () => {
    onChange("");
    setOpen(false);
    onBlur?.();
  };

  return (
    <div
      className={["nl-notice-picker-field", compact ? "nl-picker-compact" : "", className].filter(Boolean).join(" ")}
      ref={wrapRef}
    >
      {label ? <label className="nl-notice-picker-label">{label}</label> : null}
      <div className="nl-picker-wrap">
        <button
          ref={triggerRef}
          type="button"
          data-field={fieldKey}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
          className={[
            "nl-picker-trigger",
            hasValue ? "has-value" : "",
            error ? "border-red-300 ring-1 ring-red-100" : "",
            open ? "nl-picker-trigger-open" : "",
          ].join(" ")}
        >
          <span className="nl-picker-icon">{icon ?? <CalendarDays size={14} strokeWidth={2} aria-hidden />}</span>
          <span className={["nl-picker-text", hasValue ? "" : "is-placeholder"].join(" ")}>
            {hasValue ? formatDisplay(value) : placeholder}
          </span>
          <ChevronDown className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`} size={14} strokeWidth={2} aria-hidden />
        </button>

        {open && mounted
          ? createPortal(
              <div ref={popoverRef} className="nl-themed-popover nl-calendar-popover" style={popoverStyle} role="dialog" aria-label="Choose date">
                <div className="nl-calendar-head">
                  <button
                    type="button"
                    className="nl-calendar-nav"
                    aria-label="Previous month"
                    onClick={() => {
                      const next = shiftMonth(viewYear, viewMonth, -1);
                      setViewYear(next.y);
                      setViewMonth(next.m);
                    }}
                  >
                    <ChevronLeft size={16} strokeWidth={2.5} />
                  </button>
                  <p className="nl-calendar-title">
                    {MONTHS[viewMonth]} {viewYear}
                  </p>
                  <button
                    type="button"
                    className="nl-calendar-nav"
                    aria-label="Next month"
                    onClick={() => {
                      const next = shiftMonth(viewYear, viewMonth, 1);
                      setViewYear(next.y);
                      setViewMonth(next.m);
                    }}
                  >
                    <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="nl-calendar-weekdays">
                  {WEEKDAYS.map((day) => (
                    <span key={day} className="nl-calendar-weekday">
                      {day}
                    </span>
                  ))}
                </div>

                <div className="nl-calendar-grid">
                  {cells.map((cell, index) => {
                    const shifted = shiftMonth(viewYear, viewMonth, cell.monthOffset);
                    const iso = toIso(shifted.y, shifted.m, cell.day);
                    const isSelected = value === iso;
                    const isToday =
                      today.y === shifted.y && today.m === shifted.m && today.d === cell.day;
                    const isMuted = cell.monthOffset !== 0;

                    return (
                      <button
                        key={`${index}-${iso}`}
                        type="button"
                        onClick={() => pickDay(cell.day, cell.monthOffset)}
                        className={[
                          "nl-calendar-day",
                          isMuted ? "nl-calendar-day-muted" : "",
                          isSelected ? "nl-calendar-day-selected" : "",
                          isToday && !isSelected ? "nl-calendar-day-today" : "",
                        ].join(" ")}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>

                <div className="nl-calendar-foot">
                  <button type="button" className="nl-calendar-foot-btn" onClick={clear}>
                    Clear
                  </button>
                  <button type="button" className="nl-calendar-foot-btn nl-calendar-foot-btn-primary" onClick={goToday}>
                    Today
                  </button>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
