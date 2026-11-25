"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { ClearableInput } from "@/components/admin/clearable-field";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  /** When set, a heading is shown the first time this group appears. */
  group?: string;
  /** Stays at the top of the list and is not hidden by search. */
  pinned?: boolean;
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
  /** Type in the field itself to filter. Hides the search box inside the menu. */
  combobox?: boolean;
  allowCustom?: boolean;
  disabled?: boolean;
  error?: string | null;
  className?: string;
  onBlur?: () => void;
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
  combobox = false,
  allowCustom = false,
  disabled = false,
  error,
  className,
  valueLabel,
  onBlur,
}: SearchableSelectProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { style: popoverStyle, ready } = useAnchoredPopover(open, combobox ? fieldRef : triggerRef, { popoverRef });

  const selected = useMemo(() => {
    if (!value) return undefined;
    if (valueLabel) {
      return { value, label: valueLabel };
    }
    return options.find((opt) => opt.value === value) ?? { value, label: value };
  }, [value, valueLabel, options]);

  const filterText = combobox && !editing ? "" : query;
  const filtered = useMemo(() => {
    const pinned = options.filter((opt) => opt.pinned);
    const rest = options.filter((opt) => !opt.pinned);
    if (!searchable && !combobox) return [...pinned, ...rest];
    const q = filterText.trim().toLowerCase();
    if (!q) return [...pinned, ...rest];
    const matched = rest.filter((opt) => {
      const haystack = `${opt.label} ${opt.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
    return [...pinned, ...matched];
  }, [options, filterText, searchable, combobox]);

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
    setActiveIndex(0);
  }, [filterText, open]);

  useEffect(() => {
    if (!open || !searchable || combobox) {
      if (!open && !combobox) setQuery("");
      return;
    }
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, searchable, combobox]);

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

  const choose = (next: string) => {
    onChange(next);
    setEditing(false);
    setQuery("");
    setOpen(false);
  };

  const onComboKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setEditing(false);
      setQuery("");
      setOpen(false);
      return;
    }
    if (!filtered.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
    } else if (event.key === "Enter" && open) {
      const opt = filtered[activeIndex];
      if (!opt || opt.disabled) return;
      event.preventDefault();
      choose(opt.value);
    }
  };

  return (
    <div className={className} ref={wrapRef}>
      <div className="nl-picker-wrap" ref={fieldRef}>
        {combobox ? (
          <div className="relative">
            <input
              ref={searchRef}
              id={id}
              type="text"
              role="combobox"
              disabled={disabled}
              value={editing ? query : (selected?.label ?? "")}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-invalid={error ? true : undefined}
              aria-autocomplete="list"
              onFocus={(event) => {
                if (disabled) return;
                setOpen(true);
                event.currentTarget.select();
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setEditing(false);
                  setQuery("");
                  setOpen(false);
                  onBlur?.();
                }, 120);
              }}
              onChange={(event) => {
                const next = event.target.value;
                setEditing(true);
                setQuery(next);
                setOpen(true);
                if (!next.trim()) onChange("");
              }}
              onKeyDown={onComboKeyDown}
              className={[
                "nl-input box-border h-11 w-full !py-0 pr-10",
                error ? "border-red-300 ring-1 ring-red-100" : "",
                disabled ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            />
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label="Show categories"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setEditing(false);
                setQuery("");
                setOpen((valueOpen) => !valueOpen);
                searchRef.current?.focus();
              }}
            >
              <ChevronDown className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`} size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : (
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
        )}

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
                {searchable && !combobox ? (
                  <div className="border-b border-slate-100 p-2">
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

                <div className="max-h-56 overflow-y-auto p-1">
                  {filtered.length === 0 && !showCustom ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">{emptyMessage}</p>
                  ) : (
                    <>
                    {showCustom ? (
                      <button
                        type="button"
                        role="option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(customValue)}
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
                    {filtered.map((opt, index) => {
                      const active = opt.value === value;
                      const highlighted = combobox && index === activeIndex;
                      const showGroup = Boolean(opt.group) && opt.group !== filtered[index - 1]?.group;
                      return (
                        <Fragment key={opt.value}>
                        {showGroup ? (
                          <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {opt.group}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          disabled={opt.disabled}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => {
                            if (opt.disabled) return;
                            choose(opt.value);
                          }}
                          className={[
                            "nl-select-option w-full text-left",
                            active || highlighted ? "nl-select-option-selected" : "",
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
                        </Fragment>
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
