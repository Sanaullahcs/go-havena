"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { AmenityIcon } from "@/components/admin/amenity-icon";
import { BusinessHoursInput } from "@/components/admin/business-hours-input";
import {
  AMENITY_ICON_CATALOG,
  AMENITY_STATUS_OPTIONS,
  getAmenityVisual,
} from "@/lib/admin/amenity-display";
import {
  amenityFormToPayload,
  validateAmenityForm,
  type AmenityForm,
} from "@/lib/admin/amenity-form-validation";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import type { Amenity } from "@/lib/api/amenities";

const EMPTY_FORM: AmenityForm = {
  name: "",
  description: "",
  status: "bookable",
  capacity: "",
  floor: "",
  hours: "",
  weekends_available: true,
  slot_duration_minutes: "60",
  icon_key: "",
};

const SLOT_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

function amenityToForm(amenity: Amenity): AmenityForm {
  return {
    name: amenity.name ?? "",
    description: amenity.description ?? "",
    status: (amenity.status as AmenityForm["status"]) ?? "bookable",
    capacity: amenity.capacity != null ? String(amenity.capacity) : "",
    floor: amenity.floor ?? "",
    hours: amenity.hours ?? "",
    weekends_available: amenity.weekends_available !== false,
    slot_duration_minutes:
      amenity.slot_duration_minutes != null ? String(amenity.slot_duration_minutes) : "60",
    icon_key: amenity.icon_key || getAmenityVisual(amenity.name).key,
  };
}

export function AmenityFormModal({
  open,
  mode,
  amenity,
  submitting,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  mode: "create" | "edit";
  amenity?: Amenity | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: ReturnType<typeof amenityFormToPayload>) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<AmenityForm>(EMPTY_FORM);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  useEffect(() => {
    if (!open) return;
    setForm(mode === "edit" && amenity ? amenityToForm(amenity) : EMPTY_FORM);
    resetTouched();
  }, [open, mode, amenity, resetTouched]);

  const liveErrors = useMemo(() => validateAmenityForm(form), [form]);
  const canSubmit = !hasFieldErrors(liveErrors) && !submitting;

  if (!open) return null;

  const setField = <K extends keyof AmenityForm>(key: K, value: AmenityForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  };

  const handleSubmit = async () => {
    if (!validateOnSubmit(liveErrors)) return;
    await onSubmit(amenityFormToPayload(form));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {mode === "edit" ? "Edit amenity" : "Add amenity"}
            </h2>
            <p className="text-xs text-slate-500">
              Set daily hours, weekend availability, and timed slots or open access.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Name *</label>
              <input
                className={inputClass(showError("name", liveErrors.name))}
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                onBlur={() => touch("name")}
                placeholder="e.g. Swimming Pool"
                maxLength={100}
              />
              {showError("name", liveErrors.name) ? (
                <p className="mt-1 text-xs text-red-600">{liveErrors.name}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Description</label>
              <textarea
                className={`${inputClass(showError("description", liveErrors.description))} min-h-[88px] resize-y`}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                onBlur={() => touch("description")}
                placeholder="Optional details for residents"
                maxLength={2000}
              />
              {showError("description", liveErrors.description) ? (
                <p className="mt-1 text-xs text-red-600">{liveErrors.description}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Availability *</label>
              <div className="flex flex-wrap gap-2">
                {AMENITY_STATUS_OPTIONS.map((opt) => {
                  const active = form.status === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setField("status", opt.key)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-[#0B1C2E] bg-[#E8F0F7] text-[#0B1C2E]"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
                      ].join(" ")}
                    >
                      {opt.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Capacity *</label>
                <input
                  className={inputClass(showError("capacity", liveErrors.capacity))}
                  value={form.capacity}
                  onChange={(e) => setField("capacity", e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => touch("capacity")}
                  placeholder="e.g. 10"
                  inputMode="numeric"
                />
                {showError("capacity", liveErrors.capacity) ? (
                  <p className="mt-1 text-xs text-red-600">{liveErrors.capacity}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Location *</label>
                <input
                  className={inputClass(showError("floor", liveErrors.floor))}
                  value={form.floor}
                  onChange={(e) => setField("floor", e.target.value)}
                  onBlur={() => touch("floor")}
                  placeholder="e.g. Ground floor"
                  maxLength={40}
                />
                {showError("floor", liveErrors.floor) ? (
                  <p className="mt-1 text-xs text-red-600">{liveErrors.floor}</p>
                ) : null}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Hours *</label>
              <BusinessHoursInput
                value={form.hours}
                error={showError("hours", liveErrors.hours) ?? undefined}
                onChange={(value) => {
                  setField("hours", value);
                  touch("hours");
                }}
                onBlur={() => touch("hours")}
              />
              {showError("hours", liveErrors.hours) ? (
                <p className="mt-1 text-xs text-red-600">{liveErrors.hours}</p>
              ) : null}
            </div>

            <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-slate-800">Available on weekends</span>
                <span className="text-xs text-slate-500">Turn off to close Saturday & Sunday</span>
              </span>
              <input
                type="checkbox"
                checked={form.weekends_available}
                onChange={(e) => setField("weekends_available", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#0B1C2E]"
              />
            </label>

            {form.status === "bookable" ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Slot duration *
                </label>
                <div className="flex flex-wrap gap-2">
                  {SLOT_OPTIONS.map((opt) => {
                    const active = form.slot_duration_minutes === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setField("slot_duration_minutes", opt.value);
                          touch("slot_duration_minutes");
                        }}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                          active
                            ? "border-[#0B1C2E] bg-[#E8F0F7] text-[#0B1C2E]"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        ].join(" ")}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {showError("slot_duration_minutes", liveErrors.slot_duration_minutes) ? (
                  <p className="mt-1 text-xs text-red-600">{liveErrors.slot_duration_minutes}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Category *</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {AMENITY_ICON_CATALOG.map((icon) => {
                  const active = form.icon_key === icon.key;
                  return (
                    <button
                      key={icon.key}
                      type="button"
                      onClick={() => {
                        setField("icon_key", icon.key);
                        touch("icon_key");
                      }}
                      className={[
                        "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                        active
                          ? "border-[#0B1C2E] bg-[#E8F0F7] text-[#0B1C2E]"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      ].join(" ")}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: icon.soft }}
                      >
                        <AmenityIcon iconKey={icon.key} size={16} />
                      </span>
                      <span className="truncate">{icon.label}</span>
                      {active ? <Check className="ml-auto h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
              {showError("icon_key", liveErrors.icon_key) ? (
                <p className="mt-1 text-xs text-red-600">{liveErrors.icon_key}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4">
          {mode === "edit" && onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={submitting}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
            >
              Delete
            </button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="rounded-xl bg-[#0B1C2E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1B4F8A] disabled:opacity-60"
            >
              {submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Create amenity"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
