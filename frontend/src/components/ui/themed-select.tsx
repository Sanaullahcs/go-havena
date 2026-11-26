"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";

type Option = { value: string; label: string };

type ThemedSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label?: string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  fieldKey?: string;
  error?: string;
  onBlur?: () => void;
  onFocus?: () => void;
  /** Shorter trigger height — pairs with admin table toolbars. */
  compact?: boolean;
  className?: string;
};

export function ThemedSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "Select…",
  emptyMessage = "No options available",
  disabled = false,
  fieldKey,
  error,
  onBlur,
  onFocus,
  compact = false,
  className,
}: ThemedSelectProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { style: popoverStyle } = useAnchoredPopover(open, triggerRef, {
    popoverRef,
    align: "left",
    constrainToViewport: true,
    maxHeight: 256,
  });
  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      className={["nl-notice-field min-w-0 w-full", compact ? "nl-picker-compact" : "", className ?? ""].filter(Boolean).join(" ")}
      ref={wrapRef}
    >
      {label ? <label className="nl-notice-label">{label}</label> : null}
      <div className="nl-picker-wrap min-w-0 w-full">
        <button
          ref={triggerRef}
          type="button"
          data-field={fieldKey}
          title={selected?.label}
          aria-expanded={open}
          aria-haspopup="listbox"
          onFocus={onFocus}
          onBlur={() => {
            if (!open) onBlur?.();
          }}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
          }}
          className={[
            "nl-picker-trigger",
            selected ? "has-value" : "",
            error ? "border-red-300 ring-1 ring-red-100" : "",
            open ? "nl-picker-trigger-open" : "",
            disabled ? "cursor-not-allowed opacity-60" : "",
          ].join(" ")}
        >
          <span className={["nl-picker-text flex-1", selected ? "" : "is-placeholder"].join(" ")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`} size={14} strokeWidth={2} aria-hidden />
        </button>

        {open && mounted
          ? createPortal(
              <div
                ref={popoverRef}
                className="nl-themed-popover nl-select-popover !overflow-hidden flex min-h-0 flex-col p-0"
                style={popoverStyle}
                role="listbox"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
                  {options.length === 0 ? (
                    <p className="px-2.5 py-3 text-[13px] leading-snug text-slate-500">{emptyMessage}</p>
                  ) : (
                    options.map((opt) => {
                      const active = opt.value === value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            onChange(opt.value);
                            setOpen(false);
                            onBlur?.();
                          }}
                          className={["nl-select-option", active ? "nl-select-option-selected" : ""].join(" ")}
                        >
                          <span className="min-w-0 whitespace-normal break-words text-left">{opt.label}</span>
                          {active ? <Check size={14} strokeWidth={2.5} aria-hidden /> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
