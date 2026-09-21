"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Clock3 } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";

function formatTimeDisplay(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${m} ${suffix}`;
}

function buildTimeSlots(stepMinutes = 15) {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += stepMinutes) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

const TIME_SLOTS = buildTimeSlots(15);

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
}: ThemedTimePickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { style: popoverStyle } = useAnchoredPopover(open, triggerRef, {
    popoverRef,
    width: 256,
    align: "right",
  });
  const hasValue = Boolean(value);

  usePopoverDismiss(open, () => {
    setOpen(false);
    onBlur?.();
  }, wrapRef, popoverRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !value || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(`[data-time="${value}"]`);
    active?.scrollIntoView({ block: "center" });
  }, [open, value]);

  const grouped = useMemo(() => {
    const morning: string[] = [];
    const afternoon: string[] = [];
    const evening: string[] = [];
    for (const slot of TIME_SLOTS) {
      const hour = Number(slot.split(":")[0]);
      if (hour < 12) morning.push(slot);
      else if (hour < 17) afternoon.push(slot);
      else evening.push(slot);
    }
    return [
      { label: "Morning", slots: morning },
      { label: "Afternoon", slots: afternoon },
      { label: "Evening", slots: evening },
    ];
  }, []);

  const pick = (slot: string) => {
    onChange(slot);
    setOpen(false);
    onBlur?.();
  };

  const clear = () => {
    onChange("");
    setOpen(false);
    onBlur?.();
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
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => !v)}
          className={[
            "nl-picker-trigger",
            hasValue ? "has-value" : "",
            error ? "border-red-300 ring-1 ring-red-100" : "",
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
              <div ref={popoverRef} className="nl-themed-popover nl-time-popover" style={popoverStyle} role="listbox" aria-label="Choose time">
                <div ref={listRef} className="nl-time-list">
                  {grouped.map((group) =>
                    group.slots.length ? (
                      <div key={group.label} className="nl-time-group">
                        <p className="nl-time-group-label">{group.label}</p>
                        <div className="nl-time-grid">
                          {group.slots.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              data-time={slot}
                              role="option"
                              aria-selected={value === slot}
                              onClick={() => pick(slot)}
                              className={[
                                "nl-time-option",
                                value === slot ? "nl-time-option-selected" : "",
                              ].join(" ")}
                            >
                              {formatTimeDisplay(slot)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
                <div className="nl-calendar-foot">
                  <button type="button" className="nl-calendar-foot-btn" onClick={clear}>
                    Clear
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
