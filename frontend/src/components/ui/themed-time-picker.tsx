"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Clock3 } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";
import {
  formatTimeDisplay,
  NOTICE_FUTURE_TIME_MESSAGE,
  parseFlexibleTime,
  parseTimeMinutes,
} from "@/lib/admin/notice-schedule-utils";

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ["AM", "PM"] as const;

type Period = (typeof PERIODS)[number];

type TimeParts = {
  hour12: number;
  minute: number;
  period: Period;
};

const DEFAULT_PARTS: TimeParts = { hour12: 9, minute: 0, period: "AM" };

function partsFromValue(value: string): TimeParts {
  const mins = parseTimeMinutes(parseFlexibleTime(value) ?? value);
  if (mins == null) return DEFAULT_PARTS;
  const h24 = Math.floor(mins / 60);
  return {
    hour12: h24 % 12 || 12,
    minute: mins % 60,
    period: h24 >= 12 ? "PM" : "AM",
  };
}

function partsToValue(parts: TimeParts): string {
  let hour = parts.hour12 % 12;
  if (parts.period === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function isBeforeMinTime(value: string, minTime?: string): boolean {
  if (!minTime) return false;
  const selected = parseTimeMinutes(value);
  const minimum = parseTimeMinutes(minTime);
  if (selected == null || minimum == null) return false;
  return selected < minimum;
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
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef, popoverRef]);
}

type ThemedTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string;
  placeholder?: string;
  fieldKey?: string;
  error?: string;
  icon?: ReactNode;
  /** When set (HH:MM), times earlier than this cannot be selected or typed. */
  minTime?: string;
  minTimeMessage?: string;
  /**
   * Keep every hour, minute, and AM/PM option selectable.
   * The composed time is committed when the picker closes, not on each column click.
   */
  commitOnDone?: boolean;
};

export function ThemedTimePicker({
  value,
  onChange,
  onBlur,
  label,
  placeholder = "Select time",
  fieldKey,
  error,
  icon,
  minTime,
  minTimeMessage = NOTICE_FUTURE_TIME_MESSAGE,
  commitOnDone = false,
}: ThemedTimePickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [parts, setParts] = useState<TimeParts>(DEFAULT_PARTS);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const { style: popoverStyle } = useAnchoredPopover(open, triggerRef, {
    popoverRef,
    width: 288,
    align: "right",
  });
  const hasValue = Boolean(value);

  const close = () => {
    setOpen(false);
    setManualError(null);
    setDirty(false);
    onBlur?.();
  };

  const commitCurrent = () => {
    const typed = manual.trim() ? parseFlexibleTime(manual) : null;
    if (manual.trim() && !typed) {
      setManualError("Enter a valid time, like 2:20 PM.");
      return false;
    }
    const nextValue = typed ?? partsToValue(parts);
    if (!commitOnDone && isBeforeMinTime(nextValue, minTime)) {
      setManualError(minTimeMessage);
      return false;
    }
    onChange(nextValue);
    setParts(partsFromValue(nextValue));
    setManual(formatTimeDisplay(nextValue));
    setManualError(null);
    return true;
  };

  const requestClose = (forceCommit: boolean) => {
    if (commitOnDone && (forceCommit || dirty)) {
      if (!commitCurrent()) return;
    }
    close();
  };

  usePopoverDismiss(open, () => requestClose(false), wrapRef, popoverRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const next = partsFromValue(value);
    setParts(next);
    setManual(value ? formatTimeDisplay(value) : "");
    setManualError(null);
    setDirty(false);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const scrollSelected = (container: HTMLDivElement | null, selector: string) => {
      if (!container) return;
      const active = container.querySelector<HTMLElement>(selector);
      if (!active) return;
      container.scrollTop = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2;
    };
    scrollSelected(hourListRef.current, `[data-hour="${parts.hour12}"]`);
    scrollSelected(minuteListRef.current, `[data-minute="${parts.minute}"]`);
  }, [open, parts.hour12, parts.minute]);

  const selectParts = (next: TimeParts) => {
    if (commitOnDone) {
      setParts(next);
      setManual(formatTimeDisplay(partsToValue(next)));
      setManualError(null);
      setDirty(true);
      return;
    }
    applyParts(next);
  };

  const applyParts = (next: TimeParts) => {
    const nextValue = partsToValue(next);
    if (isBeforeMinTime(nextValue, minTime)) {
      setManualError(minTimeMessage);
      return false;
    }
    setParts(next);
    onChange(nextValue);
    setManual(formatTimeDisplay(nextValue));
    setManualError(null);
    return true;
  };

  const applyManual = (raw = manual) => {
    const parsed = parseFlexibleTime(raw);
    if (!parsed) {
      if (raw.trim()) setManualError("Enter a valid time, like 2:20 PM.");
      return false;
    }
    if (isBeforeMinTime(parsed, minTime)) {
      setManualError(minTimeMessage);
      return false;
    }
    applyParts(partsFromValue(parsed));
    return true;
  };

  const clear = () => {
    onChange("");
    setParts(DEFAULT_PARTS);
    setManual("");
    setManualError(null);
    close();
  };

  const done = () => {
    if (commitOnDone) {
      requestClose(true);
      return;
    }
    if (manual.trim() && parseFlexibleTime(manual) !== partsToValue(parts)) {
      if (!applyManual()) return;
    } else if (!value) {
      if (!applyParts(parts)) return;
    } else if (isBeforeMinTime(value, minTime)) {
      setManualError(minTimeMessage);
      return;
    }
    close();
  };

  return (
    <div className="nl-notice-picker-field" ref={wrapRef}>
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
            error ? "nl-picker-trigger-invalid" : "",
            open ? "nl-picker-trigger-open" : "",
          ].join(" ")}
        >
          <span className="nl-picker-icon">{icon ?? <Clock3 size={14} strokeWidth={2} aria-hidden />}</span>
          <span className={["nl-picker-text", hasValue ? "" : "is-placeholder"].join(" ")}>
            {hasValue ? formatTimeDisplay(value) : placeholder}
          </span>
          <ChevronDown className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`} size={14} strokeWidth={2} aria-hidden />
        </button>

        {open && mounted
          ? createPortal(
              <div
                ref={popoverRef}
                className="nl-themed-popover nl-time-popover"
                style={popoverStyle}
                role="dialog"
                aria-label="Choose time"
              >
                <div className="nl-time-picker-body">
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    className={["nl-time-manual", manualError ? "nl-time-manual-invalid" : ""].join(" ")}
                    placeholder="Type 2:20 PM or 14:20"
                    value={manual}
                    aria-label="Type a time"
                    onChange={(event) => {
                      setManual(event.target.value);
                      if (commitOnDone) setDirty(true);
                      if (manualError) setManualError(null);
                    }}
                    onBlur={() => {
                      if (commitOnDone) return;
                      if (manual.trim()) applyManual();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (applyManual()) close();
                      }
                    }}
                  />
                  {manualError ? <p className="nl-time-manual-error">{manualError}</p> : null}

                  <div className="nl-time-wheels">
                    <div>
                      <p className="nl-time-group-label">Hour</p>
                      <div ref={hourListRef} className="nl-time-column" role="listbox" aria-label="Hour">
                        {HOURS_12.map((hour) => {
                          const candidate = { ...parts, hour12: hour };
                          const disabled = commitOnDone ? false : isBeforeMinTime(partsToValue(candidate), minTime);
                          return (
                            <button
                              key={hour}
                              type="button"
                              data-hour={hour}
                              role="option"
                              aria-selected={parts.hour12 === hour}
                              aria-disabled={disabled}
                              disabled={disabled}
                              onClick={() => {
                                if (!disabled) selectParts(candidate);
                              }}
                              className={[
                                "nl-time-option nl-time-wheel-option",
                                parts.hour12 === hour ? "nl-time-option-selected" : "",
                                disabled ? "nl-time-option-disabled" : "",
                              ].join(" ")}
                            >
                              {hour}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="nl-time-group-label">Minute</p>
                      <div ref={minuteListRef} className="nl-time-column" role="listbox" aria-label="Minute">
                        {MINUTES.map((minute) => {
                          const candidate = { ...parts, minute };
                          const disabled = commitOnDone ? false : isBeforeMinTime(partsToValue(candidate), minTime);
                          return (
                            <button
                              key={minute}
                              type="button"
                              data-minute={minute}
                              role="option"
                              aria-selected={parts.minute === minute}
                              aria-disabled={disabled}
                              disabled={disabled}
                              onClick={() => {
                                if (!disabled) selectParts(candidate);
                              }}
                              className={[
                                "nl-time-option nl-time-wheel-option",
                                parts.minute === minute ? "nl-time-option-selected" : "",
                                disabled ? "nl-time-option-disabled" : "",
                              ].join(" ")}
                            >
                              {String(minute).padStart(2, "0")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="nl-time-group-label">Period</p>
                      <div className="nl-time-column nl-time-column-period" role="listbox" aria-label="AM or PM">
                        {PERIODS.map((period) => {
                          const candidate = { ...parts, period };
                          const disabled = commitOnDone ? false : isBeforeMinTime(partsToValue(candidate), minTime);
                          return (
                            <button
                              key={period}
                              type="button"
                              role="option"
                              aria-selected={parts.period === period}
                              aria-disabled={disabled}
                              disabled={disabled}
                              onClick={() => {
                                if (!disabled) selectParts(candidate);
                              }}
                              className={[
                                "nl-time-option nl-time-wheel-option",
                                parts.period === period ? "nl-time-option-selected" : "",
                                disabled ? "nl-time-option-disabled" : "",
                              ].join(" ")}
                            >
                              {period}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="nl-calendar-foot">
                  <button type="button" className="nl-calendar-foot-btn" onClick={clear}>
                    Clear
                  </button>
                  <button type="button" className="nl-calendar-foot-btn nl-calendar-foot-btn-primary" onClick={done}>
                    Done
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

export { formatTimeDisplay };
