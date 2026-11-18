"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { ClearableInput } from "@/components/admin/clearable-field";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  color?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchable?: boolean;
  allowCustom?: boolean;
  disabled?: boolean;
  error?: string | null;
  className?: string;
  /** Shown when `value` is set but not yet present in `options` (e.g. while options load). */
  valueLabel?: string;
};

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches found.",
  searchable = false,
  allowCustom = false,
  disabled = false,
  error,
  className,
  valueLabel,
}: SearchableSelectProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const { style: popoverStyle, ready } = useAnchoredPopover(open, triggerRef, {
    popoverRef,
    constrainToViewport: true,
    preferBelow: true,
    maxHeight: 320,
  });

  const selected = useMemo(() => {
    if (!value) return undefined;
    if (valueLabel) {
      return { value, label: valueLabel };
    }
    return options.find((opt) => opt.value === value) ?? { value, label: value };
  }, [value, valueLabel, options]);

  const filtered = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const haystack = `${opt.label} ${opt.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query, searchable]);

  const customValue = query.trim();
  const showCustom = Boolean(
    allowCustom
    && customValue.length >= 2
    && !filtered.some((opt) => opt.label.toLowerCase() === customValue.toLowerCase()),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !searchable) {
      if (!open) setQuery("");
      return;
    }
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, searchable]);

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
    <div className={className} ref={wrapRef}>
      <div className="nl-picker-wrap">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={error ? true : undefined}
          onClick={() => {
            if (!disabled) setOpen((v) => !v);
          }}
          className={[
            "nl-picker-trigger w-full",
            selected ? "has-value" : "",
            error ? "border-red-300 ring-1 ring-red-100" : "",
            open ? "nl-picker-trigger-open" : "",
            disabled ? "cursor-not-allowed opacity-60" : "",
          ].join(" ")}
        >
          <span className={["nl-picker-text flex min-w-0 flex-1 items-center gap-2", selected ? "" : "is-placeholder"].join(" ")}>
            {selected?.color ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: selected.color }}
              />
            ) : null}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDown
            className={`nl-picker-chevron shrink-0 ${open ? "nl-picker-chevron-open" : ""}`}
            size={14}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {open && mounted
          ? createPortal(
              <div
                ref={popoverRef}
                className={[
                  "nl-themed-popover nl-select-popover flex flex-col overflow-hidden p-0",
                  ready ? "nl-select-popover-open" : "",
                ].join(" ")}
                style={{ ...popoverStyle, overflow: "hidden" }}
                role="listbox"
              >
                {searchable ? (
                  <div className="shrink-0 border-b border-slate-100 p-2">
                    <div className="nl-search-field">
                      <Search className="nl-search-icon" aria-hidden />
                      <ClearableInput
                        ref={searchRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={searchPlaceholder}
                        autoComplete="off"
                        spellCheck={false}
                        className="nl-input w-full py-2 pr-3 text-sm"
                      />
                    </div>
                  </div>
                ) : null}

                <div
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
                  onWheel={(event) => event.stopPropagation()}
                >
                  {filtered.length === 0 && !showCustom ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">{emptyMessage}</p>
                  ) : (
                    <>
                    {showCustom ? (
                      <button
                        type="button"
                        role="option"
                        onClick={() => {
                          onChange(customValue);
                          setOpen(false);
                        }}
                        className="nl-select-option w-full text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">Use “{customValue}”</span>
                          <span className="block truncate text-xs font-normal text-slate-500">
                            Add this city
                          </span>
                        </span>
                      </button>
                    ) : null}
                    {filtered.map((opt) => {
                      const active = opt.value === value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={active}
                          disabled={opt.disabled}
                          onClick={() => {
                            if (opt.disabled) return;
                            onChange(opt.value);
                            setOpen(false);
                          }}
                          className={[
                            "nl-select-option w-full text-left",
                            active ? "nl-select-option-selected" : "",
                            opt.disabled ? "cursor-not-allowed opacity-50" : "",
                          ].join(" ")}
                        >
                          <span className="flex min-w-0 flex-1 items-start gap-2">
                            {opt.color ? (
                              <span
                                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: opt.color }}
                              />
                            ) : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{opt.label}</span>
                              {opt.description ? (
                                <span className="block truncate text-xs font-normal text-slate-500">
                                  {opt.description}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          {active ? <Check size={14} strokeWidth={2.5} aria-hidden className="shrink-0" /> : null}
                        </button>
                      );
                    })}
                    </>
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
