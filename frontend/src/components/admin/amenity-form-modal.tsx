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
import { formatBillAmount, formatUsdAmount } from "@/lib/admin/amenity-bill-validation";
import {
  amenityChargeModel,
  amenityFormStepErrors,
  amenityFormToPayload,
  applyAmenityChargeModel,
  inferAmenityChargeModel,
  SHARED_BILLING_FREQUENCY_OPTIONS,
  SHARED_BILLING_TYPE_LABEL,
  sharedBillingDueDayLabel,
  validateAmenityForm,
  visibleAmenityFormSteps,
  type AmenityChargeModel,
  type AmenityForm,
  type AmenityFormStep,
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
  custom_category: "",
  charge_model: "free",
  shared_billing_enabled: false,
  shared_billing_frequency: "monthly",
  shared_billing_amount: "",
  shared_billing_due_day: "",
  booking_fee: "0",
};

const SLOT_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

const STEP_COPY: Record<AmenityFormStep, { label: string; title: string; hint: string }> = {
  details: {
    label: "Details",
    title: "Basic details",
    hint: "Name the amenity and say where residents will find it.",
  },
  availability: {
    label: "Availability",
    title: "Availability",
    hint: "Set hours, weekends, and how residents book.",
  },
  billing: {
    label: "Billing",
    title: "Resident billing",
    hint: "Amenities bill each approved resident, not the unit. Community admins are never billed.",
  },
  review: {
    label: "Review",
    title: "Review & submit",
    hint: "Check the details before saving. Nothing is submitted until you confirm.",
  },
};

function amenityToForm(amenity: Amenity): AmenityForm {
  return {
    name: amenity.name ?? "",
    description: amenity.description ?? "",
    status: (amenity.status as AmenityForm["status"]) ?? "bookable",
    capacity: amenity.capacity != null && Number(amenity.capacity) > 0 ? String(amenity.capacity) : "",
    floor: amenity.floor ?? "",
    hours: amenity.hours ?? "",
    weekends_available: amenity.weekends_available !== false,
    slot_duration_minutes:
      amenity.slot_duration_minutes != null ? String(amenity.slot_duration_minutes) : "60",
    icon_key: amenity.icon_key || getAmenityVisual(amenity.name).key,
    custom_category: amenity.custom_category ?? "",
    charge_model: inferAmenityChargeModel(amenity),
    shared_billing_enabled: Boolean(amenity.shared_billing_enabled),
    shared_billing_frequency: amenity.shared_billing_frequency === "yearly" ? "yearly" : "monthly",
    shared_billing_amount:
      amenity.shared_billing_amount != null ? String(amenity.shared_billing_amount) : "",
    shared_billing_due_day:
      amenity.shared_billing_due_day != null ? String(amenity.shared_billing_due_day) : "",
    booking_fee: amenity.booking_fee != null ? String(amenity.booking_fee) : "0",
  };
}

function statusLabel(status: AmenityForm["status"]) {
  return AMENITY_STATUS_OPTIONS.find((opt) => opt.key === status)?.label ?? status;
}

function categoryLabel(iconKey: string, customCategory?: string) {
  if (iconKey === "other" && customCategory?.trim()) {
    return `Other · ${customCategory.trim()}`;
  }
  return AMENITY_ICON_CATALOG.find((icon) => icon.key === iconKey)?.label ?? iconKey;
}

function StepIndicator({
  steps,
  current,
}: {
  steps: AmenityFormStep[];
  current: AmenityFormStep;
}) {
  const currentIndex = steps.indexOf(current);

  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, index) => {
        const active = step === current;
        const done = index < currentIndex;
        return (
          <li key={step} className="flex items-center gap-1.5">
            {index > 0 ? <span className="text-[11px] text-slate-300">→</span> : null}
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold",
                active
                  ? "bg-[#1B4F8A] text-white"
                  : done
                    ? "bg-[#E8F0F7] text-[#1B4F8A]"
                    : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              <span className="tabular-nums">{index + 1}</span>
              {STEP_COPY[step].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function AmenityFormModal({
  open,
  mode,
  amenity,
  submitting,
  showSharedBilling = false,
  communityName,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  mode: "create" | "edit";
  amenity?: Amenity | null;
  submitting?: boolean;
  showSharedBilling?: boolean;
  communityName?: string | null;
  onClose: () => void;
  onSubmit: (payload: ReturnType<typeof amenityFormToPayload>) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<AmenityForm>(EMPTY_FORM);
  const [step, setStep] = useState<AmenityFormStep>("details");
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  useEffect(() => {
    if (!open) return;
    setForm(mode === "edit" && amenity ? amenityToForm(amenity) : EMPTY_FORM);
    setStep("details");
    resetTouched();
  }, [open, mode, amenity, resetTouched]);

  const liveErrors = useMemo(() => validateAmenityForm(form), [form]);
  const visibleSteps = useMemo(
    () => visibleAmenityFormSteps(showSharedBilling),
    [showSharedBilling],
  );
  const chargeModel = amenityChargeModel(form);

  useEffect(() => {
    if (!visibleSteps.includes(step)) {
      setStep(visibleSteps.includes("review") ? "review" : visibleSteps[visibleSteps.length - 1]);
    }
  }, [step, visibleSteps]);

  if (!open) return null;

  const setField = <K extends keyof AmenityForm>(key: K, value: AmenityForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  };

  const setChargeModel = (model: AmenityChargeModel) => {
    setForm((prev) => applyAmenityChargeModel(prev, model));
    clearError("booking_fee");
    clearError("shared_billing_amount");
    clearError("shared_billing_due_day");
  };

  const currentIndex = Math.max(0, visibleSteps.indexOf(step));
  const isFirst = currentIndex <= 0;
  const isLast = step === "review";

  const goBack = () => {
    if (isFirst || submitting) return;
    setStep(visibleSteps[currentIndex - 1]);
  };

  const goNext = () => {
    if (submitting || isLast) return;
    const stepErrors = amenityFormStepErrors(form, step);
    if (hasFieldErrors(stepErrors)) {
      validateOnSubmit(stepErrors);
      return;
    }
    setStep(visibleSteps[currentIndex + 1]);
  };

  const handleSubmit = async () => {
    if (!validateOnSubmit(liveErrors)) {
      if (
        liveErrors.name ||
        liveErrors.description ||
        liveErrors.floor ||
        liveErrors.icon_key ||
        liveErrors.custom_category
      ) {
        setStep("details");
      } else if (liveErrors.status || liveErrors.capacity || liveErrors.hours || liveErrors.slot_duration_minutes) {
        setStep("availability");
      } else if (liveErrors.booking_fee || liveErrors.shared_billing_amount || liveErrors.shared_billing_due_day) {
        setStep(visibleSteps.includes("billing") ? "billing" : "availability");
      }
      return;
    }
    await onSubmit(amenityFormToPayload(form));
  };

  const chargeModels: Array<{ key: AmenityChargeModel; title: string; hint: string }> = [
    {
      key: "free",
      title: "Free",
      hint: "No monthly bill and no booking fee. Best for open facilities like a playground.",
    },
    {
      key: "booking",
      title: "Pay per booking",
      hint: "The resident who reserves a slot pays a booking fee and uploads proof.",
    },
    {
      key: "monthly",
      title: "Shared monthly",
      hint: "Each approved resident is billed every month, even if they do not use it.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {mode === "edit" ? "Edit amenity" : "Add amenity"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{STEP_COPY[step].hint}</p>
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
          <div className="mt-3">
            <StepIndicator steps={visibleSteps} current={step} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">{STEP_COPY[step].title}</p>

          {step === "details" ? (
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
                          if (icon.key !== "other") {
                            setField("custom_category", "");
                          }
                          touch("icon_key");
                        }}
                        className={[
                          "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                          active
                            ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
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
                {form.icon_key === "other" ? (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Custom category *
                    </label>
                    <input
                      className={[
                        "w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition",
                        showError("custom_category", liveErrors.custom_category)
                          ? "border-red-300 focus:border-red-400"
                          : "border-slate-200 focus:border-[#1B4F8A]",
                      ].join(" ")}
                      value={form.custom_category}
                      onChange={(e) => setField("custom_category", e.target.value)}
                      onBlur={() => touch("custom_category")}
                      placeholder="e.g. Rooftop garden"
                      maxLength={80}
                    />
                    {showError("custom_category", liveErrors.custom_category) ? (
                      <p className="mt-1 text-xs text-red-600">{liveErrors.custom_category}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "availability" ? (
            <div className="space-y-4">
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
                            ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
                        ].join(" ")}
                      >
                        {opt.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.status !== "open" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Capacity / Limit</label>
                  <input
                    className={[
                      inputClass(showError("capacity", liveErrors.capacity)),
                      form.status === "closed" ? "cursor-not-allowed bg-slate-50 text-slate-400" : "",
                    ].join(" ")}
                    value={form.capacity}
                    onChange={(e) => setField("capacity", e.target.value.replace(/[^0-9]/g, ""))}
                    onBlur={() => touch("capacity")}
                    placeholder="e.g. 10"
                    inputMode="numeric"
                    disabled={form.status === "closed"}
                  />
                  <p className="mt-1 text-xs text-slate-500">Capacity is required when Slots is selected.</p>
                  {showError("capacity", liveErrors.capacity) ? (
                    <p className="mt-1 text-xs text-red-600">{liveErrors.capacity}</p>
                  ) : null}
                </div>
              ) : null}

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
                  className="h-4 w-4 rounded border-slate-300 text-[#1B4F8A]"
                />
              </label>

              {!form.shared_billing_enabled && (form.status === "open" || form.status === "bookable") ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Booking amount
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { key: "free" as const, label: "Free" },
                          { key: "booking" as const, label: "Paid" },
                        ] as const
                      ).map((opt) => {
                        const active = chargeModel === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setChargeModel(opt.key)}
                            className={[
                              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                              active
                                ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                            ].join(" ")}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {chargeModel === "booking" ? (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Booking / reservation fee *
                      </label>
                      <input
                        className={inputClass(showError("booking_fee", liveErrors.booking_fee))}
                        value={form.booking_fee}
                        onChange={(e) => setField("booking_fee", e.target.value.replace(/[^0-9.]/g, ""))}
                        onBlur={() => touch("booking_fee")}
                        placeholder="e.g. 50"
                        inputMode="decimal"
                      />
                      {showError("booking_fee", liveErrors.booking_fee) ? (
                        <p className="mt-1 text-xs text-red-600">{liveErrors.booking_fee}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

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
                              ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
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
            </div>
          ) : null}

          {step === "billing" ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                {chargeModels.map((model) => {
                  const active = chargeModel === model.key;
                  return (
                    <button
                      key={model.key}
                      type="button"
                      onClick={() => setChargeModel(model.key)}
                      className={[
                        "rounded-2xl border px-4 py-3 text-left transition",
                        active
                          ? "border-[#1B4F8A] bg-[#E8F0F7]"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{model.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{model.hint}</span>
                    </button>
                  );
                })}
              </div>

              {chargeModel === "booking" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Booking / reservation fee{chargeModel === "booking" ? " *" : ""}
                  </label>
                  <input
                    className={inputClass(showError("booking_fee", liveErrors.booking_fee))}
                    value={form.booking_fee}
                    onChange={(e) => setField("booking_fee", e.target.value.replace(/[^0-9.]/g, ""))}
                    onBlur={() => touch("booking_fee")}
                    placeholder={chargeModel === "booking" ? "e.g. 50" : "0"}
                    inputMode="decimal"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Charged to the resident who books, outside GoHavena. Use 0 if the monthly fee already covers booking.
                  </p>
                  {showError("booking_fee", liveErrors.booking_fee) ? (
                    <p className="mt-1 text-xs text-red-600">{liveErrors.booking_fee}</p>
                  ) : null}
                </div>
              ) : null}

              {form.shared_billing_enabled ? (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Billing type
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">{SHARED_BILLING_TYPE_LABEL}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Billing frequency
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {SHARED_BILLING_FREQUENCY_OPTIONS.map((opt) => {
                          const active = form.shared_billing_frequency === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setField("shared_billing_frequency", opt.value)}
                              className={[
                                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                                active
                                  ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
                                  : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
                              ].join(" ")}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Amount per resident *
                      </label>
                      <input
                        className={inputClass(showError("shared_billing_amount", liveErrors.shared_billing_amount))}
                        value={form.shared_billing_amount}
                        onChange={(e) => setField("shared_billing_amount", e.target.value.replace(/[^0-9.]/g, ""))}
                        onBlur={() => touch("shared_billing_amount")}
                        placeholder="e.g. 25"
                        inputMode="decimal"
                      />
                      {showError("shared_billing_amount", liveErrors.shared_billing_amount) ? (
                        <p className="mt-1 text-xs text-red-600">{liveErrors.shared_billing_amount}</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">Due day *</label>
                      <select
                        className={inputClass(showError("shared_billing_due_day", liveErrors.shared_billing_due_day))}
                        value={form.shared_billing_due_day}
                        onChange={(e) => {
                          setField("shared_billing_due_day", e.target.value);
                          touch("shared_billing_due_day");
                        }}
                        onBlur={() => touch("shared_billing_due_day")}
                      >
                        <option value="">Select day</option>
                        {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                          <option key={day} value={String(day)}>
                            {sharedBillingDueDayLabel(day)}
                          </option>
                        ))}
                      </select>
                      {showError("shared_billing_due_day", liveErrors.shared_billing_due_day) ? (
                        <p className="mt-1 text-xs text-red-600">{liveErrors.shared_billing_due_day}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Applicable community
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {amenity?.community_name || communityName || "This community"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Each approved resident is billed individually. Community admins are not billed.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "review" ? (
            <dl className="grid gap-2 sm:grid-cols-2">
              <ReviewRow label="Name" value={form.name.trim() || "—"} />
              <ReviewRow
                label="Category"
                value={categoryLabel(form.icon_key, form.custom_category) || "—"}
              />
              <ReviewRow label="Location" value={form.floor.trim() || "—"} />
              {form.status !== "open" ? (
                <ReviewRow label="Capacity / Limit" value={form.capacity.trim() || "—"} />
              ) : null}
              <div className="sm:col-span-2">
                <ReviewRow label="Description" value={form.description.trim() || "None"} />
              </div>
              <ReviewRow label="Availability" value={statusLabel(form.status)} />
              <ReviewRow label="Hours" value={form.hours.trim() || "—"} />
              <ReviewRow label="Weekends" value={form.weekends_available ? "Available" : "Closed"} />
              <ReviewRow
                label="Slot duration"
                value={
                  form.status === "bookable"
                    ? SLOT_OPTIONS.find((opt) => opt.value === form.slot_duration_minutes)?.label || "—"
                    : "Not used"
                }
              />
              {showSharedBilling || form.status === "open" || form.status === "bookable" ? (
                <>
                  <ReviewRow
                    label="Charge model"
                    value={
                      chargeModel === "monthly"
                        ? "Shared monthly"
                        : chargeModel === "booking"
                          ? "Pay per booking"
                          : "Free"
                    }
                  />
                  {chargeModel === "booking" ? (
                    <ReviewRow
                      label="Booking fee"
                      value={
                        Number(form.booking_fee) > 0
                          ? formatUsdAmount(Number(form.booking_fee))
                          : "None"
                      }
                    />
                  ) : null}
                  {showSharedBilling ? (
                    <ReviewRow
                      label="Shared billing"
                      value={form.shared_billing_enabled ? "On — each approved resident" : "Off"}
                    />
                  ) : null}
                  {showSharedBilling && form.shared_billing_enabled ? (
                    <>
                      <ReviewRow label="Billing type" value={SHARED_BILLING_TYPE_LABEL} />
                      <ReviewRow
                        label="Frequency"
                        value={form.shared_billing_frequency === "yearly" ? "Yearly" : "Monthly"}
                      />
                      <ReviewRow
                        label="Amount per resident"
                        value={formatBillAmount(Number(form.shared_billing_amount))}
                      />
                      <ReviewRow
                        label="Due day"
                        value={
                          form.shared_billing_due_day
                            ? sharedBillingDueDayLabel(Number(form.shared_billing_due_day), form.shared_billing_frequency)
                            : "—"
                        }
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </dl>
          ) : null}
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
            {!isFirst ? (
              <button
                type="button"
                onClick={goBack}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back
              </button>
            ) : null}
            {isLast ? (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="rounded-xl bg-[#1B4F8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163e6c] disabled:opacity-60"
              >
                {submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Create amenity"}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={submitting}
                className="rounded-xl bg-[#1B4F8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163e6c] disabled:opacity-60"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
