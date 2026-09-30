"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Plus, Search } from "lucide-react";
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

type UnitPickerFieldProps = {
  value: string;
  onChange: (unitNumber: string) => void;
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

export function UnitPickerField({
  value,
  onChange,
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
}: UnitPickerFieldProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  const triggerLabel = value.trim() || placeholder;

  const handleSelect = (unitNumber: string) => {
    onChange(unitNumber);
    setOpen(false);
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
      handleSelect(created.unit_number);
    } catch (err: unknown) {
      toastError(apiError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-w-0 w-full" ref={wrapRef}>
      <div className="nl-picker-wrap min-w-0 w-full">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          data-field={dataField}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={[
            "nl-picker-trigger h-11 w-full",
            value.trim() ? "has-value" : "",
            error ? "border-red-300 ring-1 ring-red-100" : "",
            open ? "nl-picker-trigger-open" : "",
            disabled ? "cursor-not-allowed bg-slate-50 opacity-70" : "",
          ].join(" ")}
        >
          <span className={["nl-picker-text flex-1 text-left", value.trim() ? "" : "is-placeholder"].join(" ")}>
            {triggerLabel}
          </span>
          <ChevronDown
            className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`}
            size={14}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {open && mounted
          ? createPortal(
              <div
                ref={popoverRef}
                className="nl-themed-popover nl-select-popover !overflow-hidden flex flex-col shadow-xl ring-1 ring-slate-200/80"
                style={popoverStyle}
                role="listbox"
              >
                <div className="shrink-0 border-b border-slate-100 px-3 py-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search units…"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
                      autoFocus
                    />
                  </div>
                </div>

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
                      const active = normalizeUnitNumber(unit.unit_number) === normalizeUnitNumber(value);
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
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
