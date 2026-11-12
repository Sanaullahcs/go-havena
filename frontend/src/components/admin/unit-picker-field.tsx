"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";
import { inputClass } from "@/lib/admin/form-validation-utils";
import { normalizeUnitNumber } from "@/lib/admin/unit-number";
import { toastError } from "@/lib/alert";
import { apiError } from "@/lib/api/client";

export type UnitPickerRow = {
  id: number;
  unit_number: string;
  resident_count?: number;
};

type UnitPickerFieldBase = {
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  dataField?: string;
  id?: string;
  placeholder?: string;
  loadUnits: () => Promise<UnitPickerRow[]>;
  createUnit?: (unitNumber: string) => Promise<UnitPickerRow>;
  validateNewUnit?: (unitNumber: string) => string | null;
  unitMax?: number;
};

type UnitPickerSingleProps = UnitPickerFieldBase & {
  multiple?: false;
  value: string;
  onChange: (unitNumber: string) => void;
  values?: never;
  onChangeValues?: never;
};

type UnitPickerMultiProps = UnitPickerFieldBase & {
  multiple: true;
  values: string[];
  onChangeValues: (unitNumbers: string[]) => void;
  value?: never;
  onChange?: never;
};

export type UnitPickerFieldProps = UnitPickerSingleProps | UnitPickerMultiProps;

function dedupeUnits(units: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of units) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeUnitNumber(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function UnitPickerField(props: UnitPickerFieldProps) {
  const {
    onBlur,
    error,
    disabled,
    dataField = "unit",
    id,
    placeholder = "Select unit",
    loadUnits,
    createUnit,
    validateNewUnit,
    unitMax = 50,
  } = props;
  const multiple = props.multiple === true;
  const selected = multiple
    ? dedupeUnits(props.values)
    : props.value.trim()
      ? [props.value.trim()]
      : [];

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [units, setUnits] = useState<UnitPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUnit, setNewUnit] = useState("");

  const { style: popoverStyle } = useAnchoredPopover(open, triggerRef, {
    popoverRef,
    align: "left",
    constrainToViewport: true,
    preferBelow: true,
    maxHeight: 320,
  });

  const refreshUnits = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadUnits();
      setUnits(rows.filter((row) => row.unit_number?.trim()));
    } catch {
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [loadUnits]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setShowCreate(false);
      setNewUnit("");
      return;
    }
    void refreshUnits();
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, refreshUnits]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
      onBlur?.();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onBlur]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...units].sort((a, b) =>
      a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true, sensitivity: "base" }),
    );
    if (!q) return list;
    return list.filter((unit) => unit.unit_number.toLowerCase().includes(q));
  }, [units, search]);

  const isSelected = (unitNumber: string) =>
    selected.some((row) => normalizeUnitNumber(row) === normalizeUnitNumber(unitNumber));

  const commitSelection = (next: string[]) => {
    const clean = dedupeUnits(next);
    if (multiple) {
      props.onChangeValues(clean);
      return;
    }
    props.onChange(clean[0] ?? "");
  };

  const handleSelect = (unitNumber: string) => {
    if (multiple) {
      if (isSelected(unitNumber)) {
        commitSelection(selected.filter((row) => normalizeUnitNumber(row) !== normalizeUnitNumber(unitNumber)));
      } else {
        commitSelection([...selected, unitNumber]);
      }
      return;
    }
    commitSelection([unitNumber]);
    setOpen(false);
    onBlur?.();
  };

  const removeChip = (unitNumber: string) => {
    commitSelection(selected.filter((row) => normalizeUnitNumber(row) !== normalizeUnitNumber(unitNumber)));
    onBlur?.();
  };

  const handleCreate = async () => {
    if (!createUnit || creating) return;
    const trimmed = newUnit.trim();
    const validationError = validateNewUnit?.(trimmed) ?? null;
    if (validationError) {
      toastError(validationError);
      return;
    }
    if (!trimmed) return;

    setCreating(true);
    try {
      const created = await createUnit(trimmed.slice(0, unitMax));
      setUnits((prev) => {
        const normalized = normalizeUnitNumber(created.unit_number);
        const withoutDup = prev.filter((u) => normalizeUnitNumber(u.unit_number) !== normalized);
        return [...withoutDup, created];
      });
      if (multiple) {
        if (!isSelected(created.unit_number)) {
          commitSelection([...selected, created.unit_number]);
        }
        setShowCreate(false);
        setNewUnit("");
      } else {
        handleSelect(created.unit_number);
      }
    } catch (err: unknown) {
      toastError(apiError(err));
    } finally {
      setCreating(false);
    }
  };

  const triggerLabel = multiple
    ? selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} units selected`
    : selected[0] || placeholder;

  const searchPlaceholder = multiple ? "Search or select units…" : "Search or select a unit…";

  const openPicker = () => {
    if (disabled) return;
    setOpen(true);
  };

  return (
    <div className="min-w-0 w-full" ref={wrapRef}>
      <div className="nl-picker-wrap min-w-0 w-full">
        <div ref={triggerRef} className="min-w-0 w-full">
          {open ? (
            <div
              id={id}
              data-field={dataField}
              className={[
                "nl-picker-trigger h-11 w-full !cursor-text gap-2",
                selected.length > 0 ? "has-value" : "",
                error ? "border-red-300 ring-1 ring-red-100" : "",
                "nl-picker-trigger-open",
              ].join(" ")}
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <input
                ref={searchInputRef}
                type="search"
                value={search}
                disabled={disabled}
                aria-expanded={open}
                aria-haspopup="listbox"
                placeholder={searchPlaceholder}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpen(false);
                    onBlur?.();
                  }
                }}
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                aria-label="Close unit list"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onBlur?.();
                }}
                className="shrink-0 text-slate-400 transition hover:text-slate-600"
              >
                <ChevronDown className="nl-picker-chevron nl-picker-chevron-open" size={14} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <button
              id={id}
              type="button"
              data-field={dataField}
              aria-expanded={open}
              aria-haspopup="listbox"
              disabled={disabled}
              onClick={openPicker}
              className={[
                "nl-picker-trigger h-11 w-full",
                selected.length > 0 ? "has-value" : "",
                error ? "border-red-300 ring-1 ring-red-100" : "",
                disabled ? "cursor-not-allowed bg-slate-50 opacity-70" : "",
              ].join(" ")}
            >
              <span className={["nl-picker-text flex-1 text-left", selected.length > 0 ? "" : "is-placeholder"].join(" ")}>
                {triggerLabel}
              </span>
              <ChevronDown className="nl-picker-chevron" size={14} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>

        {multiple && selected.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selected.map((unitNumber) => (
              <span
                key={normalizeUnitNumber(unitNumber)}
                className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[12px] font-semibold text-teal-800 ring-1 ring-teal-100"
              >
                {unitNumber}
                <button
                  type="button"
                  aria-label={`Remove unit ${unitNumber}`}
                  className="rounded-full p-0.5 text-teal-700/70 transition hover:bg-teal-100 hover:text-teal-900"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeChip(unitNumber);
                  }}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {open && mounted
          ? createPortal(
              <div
                ref={popoverRef}
                className="nl-themed-popover nl-select-popover !overflow-hidden flex flex-col shadow-xl ring-1 ring-slate-200/80"
                style={popoverStyle}
                role="listbox"
                aria-multiselectable={multiple || undefined}
              >
                {multiple ? (
                  <p className="shrink-0 border-b border-slate-100 px-3 py-2 text-[11.5px] text-slate-500">
                    Select one or more units. Click again to deselect.
                  </p>
                ) : null}

                <div className="grid shrink-0 grid-cols-[1fr_auto] gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <span>Unit</span>
                  <span className="text-right">Residents</span>
                </div>

                {createUnit ? (
                  <div className="shrink-0 border-b border-slate-100 px-2 py-2">
                    {showCreate ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newUnit}
                          maxLength={unitMax}
                          onChange={(e) => setNewUnit(e.target.value)}
                          placeholder="New unit number"
                          className={inputClass(undefined, "h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-[13px]")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleCreate();
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={creating || !newUnit.trim()}
                          onClick={() => void handleCreate()}
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-[#1B4F8A] px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                        >
                          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-semibold text-[#1B4F8A] transition hover:bg-[#F4F8FC]"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#E8F0F7]">
                          <Plus size={14} strokeWidth={2.5} aria-hidden />
                        </span>
                        Add new unit
                      </button>
                    )}
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                  {loading ? (
                    <p className="flex items-center gap-2 px-3 py-4 text-[13px] text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading units…
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="px-3 py-4 text-[13px] text-slate-500">
                      {search.trim() ? "No units match your search." : "No units yet. Add one above."}
                    </p>
                  ) : (
                    filtered.map((unit) => {
                      const active = isSelected(unit.unit_number);
                      const count = unit.resident_count ?? 0;
                      return (
                        <button
                          key={unit.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => handleSelect(unit.unit_number)}
                          className={[
                            "grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left transition",
                            active ? "bg-teal-50" : "hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <span className="truncate text-[13px] font-semibold text-slate-900">{unit.unit_number}</span>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums text-[12px] font-medium text-slate-500">{count}</span>
                            {active ? <Check size={14} className="text-teal-700" aria-hidden /> : null}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {multiple ? (
                  <div className="shrink-0 border-t border-slate-100 px-3 py-2.5">
                    <button
                      type="button"
                      className="nl-btn-primary w-full justify-center"
                      onClick={() => {
                        setOpen(false);
                        onBlur?.();
                      }}
                    >
                      Done{selected.length > 0 ? ` (${selected.length})` : ""}
                    </button>
                  </div>
                ) : null}
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
