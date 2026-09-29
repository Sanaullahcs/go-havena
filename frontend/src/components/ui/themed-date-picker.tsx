"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
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
  if (!y) return null;
  return { y, m: (m || 1) - 1, d: d || 1 };
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayParts() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

export type DatePickerMode = "date" | "month" | "year";

const YEAR_HORIZON = 10;

export function billingYearOptions(selectedYear?: string) {
  const start = new Date().getFullYear();
  const years = Array.from({ length: YEAR_HORIZON + 1 }, (_, index) => String(start + index));
  if (selectedYear && /^\d{4}$/.test(selectedYear) && !years.includes(selectedYear)) {
    years.unshift(selectedYear);
  }
  return years;
}

function formatDisplay(iso: string, mode: DatePickerMode = "date") {
  const parts = parseIso(iso);
  if (!parts) return iso || "";
  if (mode === "year") return String(parts.y);
  if (mode === "month") {
    return new Date(parts.y, parts.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
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

type CalendarPane = "day" | "month" | "year";

const YEAR_PAGE_SIZE = 12;

function yearPageStart(year: number) {
  return Math.floor(year / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE;
}

function isoInRange(iso: string, min?: string, max?: string) {
  if (!iso) return false;
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

function monthOutOfRange(y: number, m: number, min?: string, max?: string) {
  const start = toIso(y, m, 1);
  const end = toIso(y, m, new Date(y, m + 1, 0).getDate());
  if (min && end < min) return true;
  if (max && start > max) return true;
  return false;
}

function yearOutOfRange(y: number, min?: string, max?: string) {
  if (min && toIso(y, 11, 31) < min) return true;
  if (max && toIso(y, 0, 1) > max) return true;
  return false;
}

function yearPageHasEnabled(start: number, min?: string, max?: string) {
  for (let year = start; year < start + YEAR_PAGE_SIZE; year += 1) {
    if (!yearOutOfRange(year, min, max)) return true;
  }
  return false;
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
  mode?: DatePickerMode;
  min?: string;
  max?: string;
};

function initialPane(mode: DatePickerMode): CalendarPane {
  if (mode === "year") return "year";
  if (mode === "month") return "month";
  return "day";
}

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
  mode = "date",
  min,
  max,
}: ThemedDatePickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const popoverOptions = useMemo(() => ({ popoverRef, width: 296 }), []);
  const { style: popoverStyle } = useAnchoredPopover(open, triggerRef, popoverOptions);
  const initial = parseIso(value) ?? todayParts();
  const [viewYear, setViewYear] = useState(initial.y);
  const [viewMonth, setViewMonth] = useState(initial.m);
  const [pane, setPane] = useState<CalendarPane>(() => initialPane(mode));
  const [yearPage, setYearPage] = useState(() => yearPageStart(initial.y));
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  const closePicker = useCallback(() => {
    setPane(initialPane(mode));
    setOpen(false);
    onBlurRef.current?.();
  }, [mode]);

  usePopoverDismiss(open, closePicker, wrapRef, popoverRef);

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
  const todayIso = toIso(today.y, today.m, today.d);
  const hasValue = Boolean(value);
  const todayEnabled = isoInRange(todayIso, min, max);
  const prevMonth = shiftMonth(viewYear, viewMonth, -1);
  const nextMonth = shiftMonth(viewYear, viewMonth, 1);
  const canStepBack =
    pane === "year"
      ? yearPageHasEnabled(yearPage - YEAR_PAGE_SIZE, min, max)
      : pane === "month"
        ? !yearOutOfRange(viewYear - 1, min, max)
        : !monthOutOfRange(prevMonth.y, prevMonth.m, min, max);
  const canStepForward =
    pane === "year"
      ? yearPageHasEnabled(yearPage + YEAR_PAGE_SIZE, min, max)
      : pane === "month"
        ? !yearOutOfRange(viewYear + 1, min, max)
        : !monthOutOfRange(nextMonth.y, nextMonth.m, min, max);

  const emitDate = (iso: string) => {
    if (!isoInRange(iso, min, max)) return false;
    onChange(iso);
    return true;
  };

  const pickDay = (day: number, monthOffset: -1 | 0 | 1) => {
    const shifted = shiftMonth(viewYear, viewMonth, monthOffset);
    const iso = toIso(shifted.y, shifted.m, day);
    if (!emitDate(iso)) return;
    setViewYear(shifted.y);
    setViewMonth(shifted.m);
    closePicker();
  };

  const goToday = () => {
    if (!emitDate(todayIso)) return;
    setViewYear(today.y);
    setViewMonth(today.m);
    closePicker();
  };

  const clear = () => {
    onChange("");
    closePicker();
  };

  const openYearPane = () => {
    setYearPage(yearPageStart(viewYear));
    setPane("year");
  };

  const stepView = (delta: number) => {
    if (delta < 0 && !canStepBack) return;
    if (delta > 0 && !canStepForward) return;
    if (pane === "year") {
      setYearPage((start) => start + delta * YEAR_PAGE_SIZE);
      return;
    }
    if (pane === "month") {
      setViewYear((year) => year + delta);
      return;
    }
    const next = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(next.y);
    setViewMonth(next.m);
  };

  const yearOptions = mode === "year"
    ? billingYearOptions(value ? String(parseIso(value)?.y ?? "") : undefined).map(Number)
    : Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => yearPage + index);
  const titleLabel =
    pane === "year"
      ? `${yearPage} – ${yearPage + YEAR_PAGE_SIZE - 1}`
      : pane === "month"
        ? String(viewYear)
        : `${MONTHS[viewMonth]} ${viewYear}`;
  const navBackLabel = pane === "year" ? "Previous years" : pane === "month" ? "Previous year" : "Previous month";
  const navForwardLabel = pane === "year" ? "Next years" : pane === "month" ? "Next year" : "Next month";

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
          onClick={() => {
            setOpen((v) => {
              if (!v) setPane(initialPane(mode));
              return !v;
            });
          }}
          className={[
            "nl-picker-trigger",
            hasValue ? "has-value" : "",
            error ? "border-red-300 ring-1 ring-red-100" : "",
            open ? "nl-picker-trigger-open" : "",
          ].join(" ")}
        >
          <span className="nl-picker-icon">{icon ?? <CalendarDays size={14} strokeWidth={2} aria-hidden />}</span>
          <span className={["nl-picker-text", hasValue ? "" : "is-placeholder"].join(" ")}>
            {hasValue ? formatDisplay(value, mode) : placeholder}
          </span>
          <ChevronDown className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`} size={14} strokeWidth={2} aria-hidden />
        </button>

        {open && mounted
          ? createPortal(
              <div
                ref={popoverRef}
                className={["nl-themed-popover", "nl-calendar-popover", pane === "day" ? "" : "nl-calendar-popover-settled"].filter(Boolean).join(" ")}
                style={popoverStyle}
                role="dialog"
                aria-label="Choose date"
              >
                <div className="nl-calendar-head">
                  <button
                    type="button"
                    className="nl-calendar-nav"
                    aria-label={navBackLabel}
                    disabled={mode === "year" || !canStepBack}
                    onClick={() => stepView(-1)}
                  >
                    <ChevronLeft size={16} strokeWidth={2.5} />
                  </button>
                  {pane === "year" || mode === "year" ? (
                    <p className="nl-calendar-title">{mode === "year" ? "Choose year" : titleLabel}</p>
                  ) : (
                    <button
                      type="button"
                      className="nl-calendar-title-btn"
                      aria-label="Choose year"
                      onClick={openYearPane}
                    >
                      <span>{titleLabel}</span>
                      <ChevronDown size={14} strokeWidth={2.5} aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    className="nl-calendar-nav"
                    aria-label={navForwardLabel}
                    disabled={mode === "year" || !canStepForward}
                    onClick={() => stepView(1)}
                  >
                    <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                </div>

                {pane === "year" ? (
                  <div className="nl-calendar-meta-grid" role="listbox" aria-label="Choose year">
                    {yearOptions.map((year) => {
                      const isSelected = year === viewYear;
                      const isToday = year === today.y;
                      const isDisabled = yearOutOfRange(year, min, max);
                      return (
                        <button
                          key={year}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            setViewYear(year);
                            if (mode === "year") {
                              onChange(toIso(year, 0, 1));
                              closePicker();
                              return;
                            }
                            setPane("month");
                          }}
                          className={[
                            "nl-calendar-meta-cell",
                            isSelected ? "nl-calendar-day-selected" : "",
                            isToday && !isSelected ? "nl-calendar-day-today" : "",
                            isDisabled ? "nl-calendar-day-disabled" : "",
                          ].join(" ")}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>
                ) : pane === "month" ? (
                  <div className="nl-calendar-meta-grid" role="listbox" aria-label="Choose month">
                    {MONTHS.map((month, index) => {
                      const selectedParts = parseIso(value);
                      const monthSelected = selectedParts
                        ? selectedParts.y === viewYear && selectedParts.m === index
                        : index === viewMonth;
                      const isToday = today.y === viewYear && today.m === index;
                      const isDisabled = monthOutOfRange(viewYear, index, min, max);
                      return (
                        <button
                          key={month}
                          type="button"
                          role="option"
                          aria-selected={monthSelected}
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            setViewMonth(index);
                            if (mode === "month") {
                              onChange(toIso(viewYear, index, 1));
                              closePicker();
                              return;
                            }
                            setPane("day");
                          }}
                          className={[
                            "nl-calendar-meta-cell",
                            monthSelected ? "nl-calendar-day-selected" : "",
                            isToday && !monthSelected ? "nl-calendar-day-today" : "",
                            isDisabled ? "nl-calendar-day-disabled" : "",
                          ].join(" ")}
                        >
                          {month.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <>
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
                        const isDisabled = !isoInRange(iso, min, max);

                        return (
                          <button
                            key={`${index}-${iso}`}
                            type="button"
                            disabled={isDisabled}
                            aria-disabled={isDisabled}
                            onClick={() => pickDay(cell.day, cell.monthOffset)}
                            className={[
                              "nl-calendar-day",
                              isMuted ? "nl-calendar-day-muted" : "",
                              isSelected ? "nl-calendar-day-selected" : "",
                              isToday && !isSelected ? "nl-calendar-day-today" : "",
                              isDisabled ? "nl-calendar-day-disabled" : "",
                            ].join(" ")}
                          >
                            {cell.day}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="nl-calendar-foot">
                  <button type="button" className="nl-calendar-foot-btn" onClick={clear}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="nl-calendar-foot-btn nl-calendar-foot-btn-primary"
                    disabled={mode === "date" && !todayEnabled}
                    onClick={() => {
                      if (mode === "year") {
                        onChange(toIso(today.y, 0, 1));
                        closePicker();
                        return;
                      }
                      if (mode === "month") {
                        onChange(toIso(today.y, today.m, 1));
                        closePicker();
                        return;
                      }
                      goToday();
                    }}
                  >
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
