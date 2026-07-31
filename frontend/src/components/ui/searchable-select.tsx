"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  color?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchable?: boolean;
  disabled?: boolean;
  error?: string | null;
  className?: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches found.",
  searchable = false,
  disabled = false,
  error,
  className,
}: SearchableSelectProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const { style: popoverStyle, ready } = useAnchoredPopover(open, triggerRef, { popoverRef });

  const selected = options.find((opt) => opt.value === value);

  const filtered = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const haystack = `${opt.label} ${opt.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query, searchable]);

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
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
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
                  "nl-themed-popover nl-select-popover overflow-hidden p-0",
                  ready ? "nl-select-popover-open" : "",
                ].join(" ")}
                style={popoverStyle}
                role="listbox"
              >
                {searchable ? (
                  <div className="border-b border-slate-100 p-2">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        aria-hidden
                      />
                      <input
                        ref={searchRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="nl-input w-full py-2 pl-8 pr-3 text-sm"
                      />
                    </div>
                  </div>
                ) : null}

                <div className="max-h-56 overflow-y-auto p-1">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">{emptyMessage}</p>
                  ) : (
                    filtered.map((opt) => {
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
