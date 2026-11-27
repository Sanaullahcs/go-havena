"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { occupancyLabel, type LandlordOccupancy } from "@/lib/api/landlord";
import { fetchCommunityUnits, type CommunityUnit } from "@/lib/api/property-services";
import { apiError } from "@/lib/api/client";

const OCCUPANCY_OPTIONS: LandlordOccupancy[] = ["live_here", "rented", "vacant"];

const OCCUPANCY_DOT: Record<LandlordOccupancy, string> = {
  live_here: "bg-emerald-500",
  rented: "bg-amber-500",
  vacant: "bg-slate-400",
};

export type ClaimUnitDraft = {
  unitNumber: string;
  isNewUnit: boolean;
  occupancy: LandlordOccupancy;
  proofFile: File | null;
};

function normalizeUnit(value: string) {
  return value.trim().toLowerCase();
}

export function ClaimUnitDialog({
  open,
  submitting,
  communityId,
  unavailableUnitNumbers,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  communityId?: number;
  unavailableUnitNumbers: string[];
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (draft: ClaimUnitDraft) => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("existing");
  const [unitNumber, setUnitNumber] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<LandlordOccupancy>("rented");
  const [occupancyOpen, setOccupancyOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [units, setUnits] = useState<CommunityUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [unitQuery, setUnitQuery] = useState("");
  const occupancyRef = useRef<HTMLDivElement>(null);

  const taken = useMemo(
    () => new Set(unavailableUnitNumbers.map(normalizeUnit).filter(Boolean)),
    [unavailableUnitNumbers],
  );

  const claimableUnits = useMemo(() => {
    const query = normalizeUnit(unitQuery);
    return units
      .filter((unit) => unit.kind !== "office")
      .filter((unit) => !taken.has(normalizeUnit(unit.unit_number)))
      .filter((unit) => !query || normalizeUnit(unit.unit_number).includes(query))
      .sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }));
  }, [units, taken, unitQuery]);

  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;

  useEffect(() => {
    if (!open) return;
    setMode("existing");
    setUnitNumber("");
    setSelectedUnitId(null);
    setOccupancy("rented");
    setOccupancyOpen(false);
    setProofFile(null);
    setUnitQuery("");
  }, [open]);

  useEffect(() => {
    if (!open || !communityId) return;
    let cancelled = false;
    setUnitsLoading(true);
    setUnitsError(null);
    void fetchCommunityUnits(communityId)
      .then((list) => {
        if (!cancelled) setUnits(list);
      })
      .catch((err) => {
        if (!cancelled) setUnitsError(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setUnitsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, communityId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (occupancyOpen) {
        setOccupancyOpen(false);
        return;
      }
      if (!submitting) onClose();
    }
    function onPointer(event: MouseEvent) {
      if (!occupancyOpen) return;
      if (occupancyRef.current?.contains(event.target as Node)) return;
      setOccupancyOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, occupancyOpen, onClose, submitting]);

  if (!open) return null;

  const activeNumber = mode === "new" ? unitNumber.trim() : selectedUnit?.unit_number ?? "";
  const occupied = mode === "existing" && (selectedUnit?.resident_count ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="claim-unit-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Ownership</p>
            <h2 id="claim-unit-title" className="mt-1 text-lg font-semibold text-slate-900">
              Claim a unit
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={submitting}
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
          An admin reviews every claim. Nothing changes for the people who live in a unit until that review is finished.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              mode === "new" ? "border-[#CFF3EA] bg-[#E7F8F4]" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className={`block text-[13px] font-semibold ${mode === "new" ? "text-[#0F766E]" : "text-slate-800"}`}>
              Add a new unit
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">Not in the directory yet</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              mode === "existing" ? "border-[#CFF3EA] bg-[#E7F8F4]" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className={`block text-[13px] font-semibold ${mode === "existing" ? "text-[#0F766E]" : "text-slate-800"}`}>
              Claim an existing unit
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">Already registered</span>
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {mode === "new" ? (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Unit number</span>
              <input
                value={unitNumber}
                onChange={(event) => setUnitNumber(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
                placeholder="e.g. 302"
              />
              <span className="mt-1.5 block text-[12px] leading-relaxed text-slate-400">
                Use this when the unit is not listed in the community yet.
              </span>
              {fieldErrors.unit_number ? (
                <span className="mt-1 block text-xs text-red-600">{fieldErrors.unit_number}</span>
              ) : null}
            </label>
          ) : (
            <div className="text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Existing unit</span>
              <input
                value={unitQuery}
                onChange={(event) => setUnitQuery(event.target.value)}
                placeholder="Search unit number"
                className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[#99F6E4] focus:ring-2 focus:ring-[#CCFBF1]"
              />
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1">
                {unitsLoading ? (
                  <p className="px-2.5 py-3 text-[13px] text-slate-400">Loading units…</p>
                ) : unitsError ? (
                  <p className="px-2.5 py-3 text-[13px] text-red-600">{unitsError}</p>
                ) : claimableUnits.length === 0 ? (
                  <p className="px-2.5 py-3 text-[13px] leading-relaxed text-slate-400">
                    {unitQuery
                      ? "No units match that number."
                      : "No registered units are left to claim. Add a new unit instead."}
                  </p>
                ) : (
                  claimableUnits.map((unit) => {
                    const selected = unit.id === selectedUnitId;
                    const count = unit.resident_count ?? 0;
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => {
                          setSelectedUnitId(unit.id);
                          if (count > 0 && occupancy === "live_here") setOccupancy("rented");
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                          selected ? "bg-[#E7F8F4] font-semibold text-[#0F766E]" : "font-medium text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{unit.unit_number}</span>
                          {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                        </span>
                        <span className={`shrink-0 text-[11px] font-medium ${selected ? "text-[#0F766E]" : "text-slate-400"}`}>
                          {count === 0 ? "No residents" : count === 1 ? "1 resident" : `${count} residents`}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                Choose a unit that is already in the directory, even if a tenant lives there. Their residency stays as it is while the claim is pending.
              </p>
              {fieldErrors.unit_number ? (
                <span className="mt-1 block text-xs text-red-600">{fieldErrors.unit_number}</span>
              ) : null}
            </div>
          )}

          <div className="text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">Ownership proof</span>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer rounded-lg bg-[#E7F8F4] px-3 py-2 text-[13px] font-semibold text-[#0F766E]">
                Choose file
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <span className="min-w-0 truncate text-[13px] text-slate-500">{proofFile?.name ?? "No file chosen"}</span>
            </div>
            <span className="mt-1.5 block text-[12px] leading-relaxed text-slate-400">
              Upload a document that shows you own this unit.
            </span>
            {fieldErrors.proof_url ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.proof_url}</span> : null}
          </div>

          <div ref={occupancyRef} className="relative text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">How is this unit used?</span>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={occupancyOpen}
              onClick={() => setOccupancyOpen((value) => !value)}
              className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 text-[13px] font-medium text-slate-800 transition ${
                occupancyOpen ? "border-[#99F6E4] ring-2 ring-[#CCFBF1]" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${OCCUPANCY_DOT[occupancy]}`} />
                <span className="truncate">{occupancyLabel(occupancy)}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition duration-150 ${occupancyOpen ? "rotate-180" : ""}`} />
            </button>
            <div
              role="listbox"
              aria-label="How is this unit used?"
              className={`absolute left-0 right-0 top-[calc(100%+6px)] z-30 origin-top rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.1)] transition duration-150 ${
                occupancyOpen ? "visible scale-100 opacity-100" : "pointer-events-none invisible scale-95 opacity-0"
              }`}
            >
              {OCCUPANCY_OPTIONS.map((option) => {
                const selected = occupancy === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setOccupancy(option);
                      setOccupancyOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                      selected ? "bg-[#E7F8F4] font-semibold text-[#0F766E]" : "font-medium text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${OCCUPANCY_DOT[option]}`} />
                    <span className="min-w-0 flex-1 truncate">{occupancyLabel(option)}</span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
            {occupied ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                Residents already live here. Choose Rented out so their residency stays in place. You can mark the unit as the home you live in only after they have moved out.
              </p>
            ) : (
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                This describes the unit after an admin approves the claim.
              </p>
            )}
            {fieldErrors.occupancy ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.occupancy}</span> : null}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !activeNumber}
            onClick={() =>
              onSubmit({
                unitNumber: activeNumber,
                isNewUnit: mode === "new",
                occupancy,
                proofFile,
              })
            }
            className="flex-1 rounded-xl bg-[#1B4F8A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#163f6e] disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </div>
    </div>
  );
}
