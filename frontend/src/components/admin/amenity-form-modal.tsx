"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { AmenityIcon } from "@/components/admin/amenity-icon";
import { BusinessHoursInput } from "@/components/admin/business-hours-input";
import { SlotDurationField } from "@/components/admin/slot-duration-field";
import {
  AMENITY_ICON_CATALOG,
  AMENITY_STATUS_OPTIONS,
  getAmenityVisual,
} from "@/lib/admin/amenity-display";
import { formatBillAmount, formatUsdAmount } from "@/lib/admin/amenity-bill-validation";
import {
  AMENITY_FIELD_MAX,
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
import { formatSlotDurationLabel } from "@/lib/admin/amenity-slot-duration";
import { parseStoredSchedule } from "@/lib/admin/hours-range-utils";
import type { Amenity } from "@/lib/api/amenities";

const EMPTY_FORM: AmenityForm = {
  name: "",
  description: "",
  status: "bookable",
  capacity: "",
  capacity_booking_type: "per_seat",
  floor: "",
  hours: "",
  opening_date: "",
  closing_date: "",
  open_24_hours: false,
  weekends_available: true,
  slot_duration_minutes: "60",
  icon_key: "",
  custom_category: "",
  charge_model: "",
  shared_billing_enabled: false,
  shared_billing_frequency: "monthly",
  shared_billing_amount: "",
  shared_billing_due_day: "",
  booking_fee: "",
};

const STEP_COPY: Record<AmenityFormStep, { label: string; title: string; hint: string }> = {
  details: {
    label: "Details",
    title: "Basic details",
    hint: "Name the amenity and say where residents will find it.",
  },
  availability: {
    label: "Availability",
    title: "Availability",
    hint: "Set hours, weekends, timed slots, and how many people can share a slot.",
  },
  billing: {
    label: "Billing",
    title: "Resident billing",
    hint: "Choose free, a reservation fee per person, or shared billing per resident. Community admins are never billed.",
  },
  review: {
    label: "Review",
    title: "Review & submit",
    hint: "Check the details before saving. Nothing is submitted until you confirm.",
  },
};

function amenityToForm(amenity: Amenity): AmenityForm {
  const schedule = parseStoredSchedule(amenity.hours ?? "");
  return {
    name: amenity.name ?? "",
    description: amenity.description ?? "",
    status: (amenity.status as AmenityForm["status"]) ?? "bookable",
    capacity: amenity.capacity != null && Number(amenity.capacity) > 0 ? String(amenity.capacity) : "",
    capacity_booking_type: amenity.capacity_booking_type === "full_slot" ? "full_slot" : "per_seat",
    floor: amenity.floor ?? "",
    hours: amenity.hours ?? "",
    opening_date: schedule.openingDate,
    closing_date: schedule.closingDate,
    open_24_hours: schedule.open24Hours,
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
    booking_fee: amenity.booking_fee != null && Number(amenity.booking_fee) > 0 ? String(amenity.booking_fee) : "",
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

function ReviewRow({ label, value, long = false }: { label: string; value: string; long?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd
        className={
          long
            ? "mt-1 whitespace-pre-wrap break-words text-sm font-normal leading-relaxed text-slate-700"
            : "mt-0.5 text-sm font-medium text-slate-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function FormLabel({ required, children }: { required?: boolean; children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function FieldMeta({ error, value, max }: { error?: string; value?: string; max?: number }) {
  const text = value ?? "";
  const showCounter = max != null && text.length > 0;
  if (!error && !showCounter) return null;
  return (
    <div className="mt-1 flex items-start justify-end gap-2">
      {error ? <p className="mr-auto text-xs text-red-600">{error}</p> : <span className="mr-auto" />}
      {showCounter ? (
        <p className={`shrink-0 text-[11px] tabular-nums ${text.length > max ? "text-red-600" : "text-slate-400"}`}>
          {text.length}/{max}
        </p>
      ) : null}
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
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  const bookingFeeFullSlot = form.capacity_booking_type === "full_slot";
  const fieldError = (field: string, value?: string, max?: number) => {
    const message = liveErrors[field];
    if (!message) return undefined;
    if (max != null && String(value ?? "").length > max) return message;
    return showError(field, liveErrors);
  };

  useEffect(() => {
    if (!visibleSteps.includes(step)) {
      setStep(visibleSteps.includes("review") ? "review" : visibleSteps[visibleSteps.length - 1]);
    }
  }, [step, visibleSteps]);

  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const { body } = document;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    const overlay = overlayRef.current;
    const scrollEl = scrollRef.current;
    let touchStartY = 0;

    const canScroll = (el: HTMLElement, deltaY: number) => {
      if (el.scrollHeight <= el.clientHeight + 1) return false;
      if (deltaY < 0) return el.scrollTop > 0;
      if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      return true;
    };

    const scrollableFrom = (target: EventTarget | null) => {
      if (!scrollEl || !(target instanceof Node) || !scrollEl.contains(target)) return null;
      let node = target instanceof Element ? target : target.parentElement;
      while (node && node !== scrollEl) {
        if (node instanceof HTMLElement) {
          const overflowY = getComputedStyle(node).overflowY;
          if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
            return node;
          }
        }
        node = node.parentElement;
      }
      return scrollEl;
    };

    const blockBackgroundScroll = (event: WheelEvent | TouchEvent, deltaY: number) => {
      if (!scrollEl || !(event.target instanceof Node) || !scrollEl.contains(event.target)) {
        event.preventDefault();
        return;
      }
      const nested = scrollableFrom(event.target);
      if (nested && nested !== scrollEl && canScroll(nested, deltaY)) return;
      if (canScroll(scrollEl, deltaY)) return;
      event.preventDefault();
    };

    const onWheel = (event: WheelEvent) => {
      blockBackgroundScroll(event, event.deltaY);
    };
    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY ?? touchStartY;
      blockBackgroundScroll(event, touchStartY - currentY);
    };

    overlay?.addEventListener("wheel", onWheel, { passive: false });
    overlay?.addEventListener("touchstart", onTouchStart, { passive: true });
    overlay?.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      html.style.overscrollBehavior = previous.htmlOverscroll;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      overlay?.removeEventListener("wheel", onWheel);
      overlay?.removeEventListener("touchstart", onTouchStart);
      overlay?.removeEventListener("touchmove", onTouchMove);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || step !== "details") return;
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = Number.parseFloat(getComputedStyle(el).maxHeight);
    const border = el.offsetHeight - el.clientHeight;
    const contentHeight = el.scrollHeight + border;
    const next = Number.isFinite(maxHeight) ? Math.min(contentHeight, maxHeight) : contentHeight;
    el.style.height = `${Math.max(next, 88)}px`;
  }, [open, step, form.description]);

  if (!open) return null;

  const setField = <K extends keyof AmenityForm>(key: K, value: AmenityForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearError(key);
    touch(key);
  };

  const setChargeModel = (model: AmenityChargeModel) => {
    setForm((prev) => applyAmenityChargeModel(prev, model));
    touch("charge_model");
    clearError("charge_model");
    clearError("booking_fee");
    clearError("shared_billing_amount");
    clearError("shared_billing_due_day");
  };

  const setChoice = <K extends keyof AmenityForm>(key: K, value: AmenityForm[K]) => {
    setField(key, value);
    touch(key);
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
    const stepErrors = amenityFormStepErrors(form, step, showSharedBilling);
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
      } else if (
        liveErrors.status ||
        liveErrors.capacity ||
        liveErrors.capacity_booking_type ||
        liveErrors.hours ||
        liveErrors.slot_duration_minutes ||
        (!showSharedBilling && (liveErrors.charge_model || liveErrors.booking_fee))
      ) {
        setStep("availability");
      } else if (
        liveErrors.charge_model ||
        liveErrors.booking_fee ||
        liveErrors.shared_billing_amount ||
        liveErrors.shared_billing_due_day
      ) {
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
      hint: "No reservation fee and no shared bill. Residents can still request a slot.",
    },
    {
      key: "booking",
      title: "Per booking",
      hint: "Charge a reservation fee per person for per-seat amenities, or once per booking for full-slot amenities.",
    },
    {
      key: "monthly",
      title: "Shared amenity",
      hint: "Bill each approved resident every month or year. No per-booking fee.",
    },
  ];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center overscroll-none bg-slate-900/40 p-4 sm:items-center"
    >
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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">{STEP_COPY[step].title}</p>

          {step === "details" ? (
            <div className="space-y-4">
              <div>
                <FormLabel required>Name</FormLabel>
                <input
                  className={inputClass(fieldError("name", form.name, AMENITY_FIELD_MAX.name))}
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value.slice(0, 100))}
                  onBlur={() => touch("name")}
                  placeholder="e.g. Swimming Pool"
                />
                <FieldMeta
                  error={fieldError("name", form.name, AMENITY_FIELD_MAX.name)}
                  value={form.name}
                  max={AMENITY_FIELD_MAX.name}
                />
              </div>

              <div>
                <FormLabel>Description</FormLabel>
                <textarea
                  ref={descriptionRef}
                  rows={3}
                  className={`${inputClass(fieldError("description", form.description, AMENITY_FIELD_MAX.description))} min-h-[88px] max-h-[min(16rem,40vh)] resize-none overflow-y-auto`}
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value.slice(0, AMENITY_FIELD_MAX.description))}
                  onBlur={() => touch("description")}
                  placeholder="Optional details for residents"
                />
                <FieldMeta
                  error={fieldError("description", form.description, AMENITY_FIELD_MAX.description)}
                  value={form.description}
                  max={AMENITY_FIELD_MAX.description}
                />
              </div>

              <div>
                <FormLabel required>Location</FormLabel>
                <input
                  className={inputClass(fieldError("floor", form.floor, AMENITY_FIELD_MAX.floor))}
                  value={form.floor}
                  onChange={(e) => setField("floor", e.target.value)}
                  onBlur={() => touch("floor")}
                  placeholder="e.g. Ground floor"
                />
                <FieldMeta
                  error={fieldError("floor", form.floor, AMENITY_FIELD_MAX.floor)}
                  value={form.floor}
                  max={AMENITY_FIELD_MAX.floor}
                />
              </div>

              <div>
                <FormLabel required>Category</FormLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {AMENITY_ICON_CATALOG.map((icon) => {
                    const active = form.icon_key === icon.key;
                    return (
                      <button
                        key={icon.key}
                        type="button"
                        onClick={() => {
                          setChoice("icon_key", icon.key);
                          if (icon.key !== "other") {
                            setField("custom_category", "");
                          }
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
                {fieldError("icon_key") ? (
                  <p className="mt-1 text-xs text-red-600">{fieldError("icon_key")}</p>
                ) : null}
                {form.icon_key === "other" ? (
                  <div className="mt-3">
                    <FormLabel required>Custom category</FormLabel>
                    <input
                      className={inputClass(fieldError("custom_category", form.custom_category, AMENITY_FIELD_MAX.custom_category))}
                      value={form.custom_category}
                      onChange={(e) => setField("custom_category", e.target.value)}
                      onBlur={() => touch("custom_category")}
                      placeholder="e.g. Rooftop garden"
                    />
                    <FieldMeta
                      error={fieldError("custom_category", form.custom_category, AMENITY_FIELD_MAX.custom_category)}
                      value={form.custom_category}
                      max={AMENITY_FIELD_MAX.custom_category}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "availability" ? (
            <div className="space-y-4">
              <div>
                <FormLabel required>Availability</FormLabel>
                <div className="flex flex-wrap gap-2">
                  {AMENITY_STATUS_OPTIONS.map((opt) => {
                    const active = form.status === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setChoice("status", opt.key)}
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
                {fieldError("status") ? (
                  <p className="mt-1 text-xs text-red-600">{liveErrors.status}</p>
                ) : null}
              </div>

              {form.status !== "open" ? (
                <div>
                  <FormLabel required={form.status === "bookable"}>
                    {form.status === "bookable" ? "People per time slot" : "Capacity / Limit"}
                  </FormLabel>
                  <input
                    className={[
                      inputClass(fieldError("capacity")),
                      form.status === "closed" ? "cursor-not-allowed bg-slate-50 text-slate-400" : "",
                    ].join(" ")}
                    value={form.capacity}
                    onChange={(e) => setField("capacity", e.target.value.replace(/[^0-9]/g, ""))}
                    onBlur={() => touch("capacity")}
                    placeholder="e.g. 50"
                    inputMode="numeric"
                    disabled={form.status === "closed"}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {form.status === "bookable"
                      ? form.capacity_booking_type === "full_slot"
                        ? "This many people fit in the slot. One booking still reserves the whole slot."
                        : "Several residents can book the same slot until this many seats are reserved."
                      : "Capacity is required when Slots is selected."}
                  </p>
                  {fieldError("capacity") ? (
                    <p className="mt-1 text-xs text-red-600">{liveErrors.capacity}</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      {form.status === "bookable"
                        ? form.capacity_booking_type === "full_slot"
                          ? "This many people fit in the slot. One booking still reserves the whole slot."
                          : "Several residents can book the same slot until this many seats are reserved."
                        : "Capacity is required when Slots is selected."}
                    </p>
                  )}
                </div>
              ) : null}

              {form.status === "bookable" ? (
                <div>
                  <FormLabel required>Capacity booking type</FormLabel>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      {
                        key: "per_seat" as const,
                        title: "Book per seat in a slot",
                        hint: "Residents choose how many seats to hold. Leftover seats stay open for others.",
                      },
                      {
                        key: "full_slot" as const,
                        title: "Book full slot",
                        hint: "A booking reserves the entire time slot, even if fewer people attend.",
                      },
                    ]).map((opt) => {
                      const active = (form.capacity_booking_type || "per_seat") === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setChoice("capacity_booking_type", opt.key)}
                          className={[
                            "rounded-xl border px-3 py-2.5 text-left transition",
                            active
                              ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
                              : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
                          ].join(" ")}
                        >
                          <span className="block text-xs font-semibold">{opt.title}</span>
                          <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{opt.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  {fieldError("capacity_booking_type") ? (
                    <p className="mt-1 text-xs text-red-600">{liveErrors.capacity_booking_type}</p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <FormLabel required>Hours</FormLabel>
                <BusinessHoursInput
                  value={form.hours}
                  error={fieldError("hours") ?? undefined}
                  onChange={(value) => setField("hours", value)}
                  onBlur={() => touch("hours")}
                />
                {fieldError("hours") ? (
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

              {!showSharedBilling && !form.shared_billing_enabled && (form.status === "open" || form.status === "bookable") ? (
                <div className="space-y-3">
                  <div>
                    <FormLabel required>How residents pay</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { key: "free" as const, label: "Free" },
                          { key: "booking" as const, label: "Per booking" },
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
                    <p className="mt-1 text-xs text-slate-500">
                      Choose a type to continue. Reservation fee is only needed for per-booking amenities.
                    </p>
                    {fieldError("charge_model") ? (
                      <p className="mt-1 text-xs text-red-600">{liveErrors.charge_model}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        Choose a type to continue. Reservation fee is only needed for per-booking amenities.
                      </p>
                    )}
                  </div>
                  {chargeModel === "booking" ? (
                    <div>
                      <FormLabel required>
                        {bookingFeeFullSlot ? "Reservation fee per slot" : "Reservation fee per person"}
                      </FormLabel>
                      <input
                        className={inputClass(fieldError("booking_fee"))}
                        value={form.booking_fee}
                        onChange={(e) => setField("booking_fee", e.target.value.replace(/[^0-9.]/g, ""))}
                        onBlur={() => touch("booking_fee")}
                        placeholder="e.g. 10"
                        inputMode="decimal"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {bookingFeeFullSlot
                          ? "Flat fee for the whole slot at booking. Billed after the owner approves."
                          : "Charged after approval. Two guests at $10 each pay $20."}
                      </p>
                      {fieldError("booking_fee") ? (
                        <p className="mt-1 text-xs text-red-600">{liveErrors.booking_fee}</p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400">
                          {bookingFeeFullSlot
                            ? "Flat fee for the whole slot at booking. Billed after the owner approves."
                            : "Charged after approval. Two guests at $10 each pay $20."}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {form.status === "bookable" ? (
                <div>
                  <FormLabel required>Slot duration</FormLabel>
                  <SlotDurationField
                    minutes={form.slot_duration_minutes}
                    onChangeMinutes={(value) => setChoice("slot_duration_minutes", value)}
                    onBlur={() => touch("slot_duration_minutes")}
                    error={fieldError("slot_duration_minutes") ? liveErrors.slot_duration_minutes : null}
                  />
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

              {fieldError("charge_model") ? (
                <p className="text-xs text-red-600">{liveErrors.charge_model}</p>
              ) : null}

              {chargeModel === "booking" ? (
                <div>
                  <FormLabel required>
                    {bookingFeeFullSlot ? "Reservation fee per slot" : "Reservation fee per person"}
                  </FormLabel>
                  <input
                    className={inputClass(fieldError("booking_fee"))}
                    value={form.booking_fee}
                    onChange={(e) => setField("booking_fee", e.target.value.replace(/[^0-9.]/g, ""))}
                    onBlur={() => touch("booking_fee")}
                    placeholder="e.g. 10"
                    inputMode="decimal"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    {bookingFeeFullSlot
                      ? "Flat fee for the whole slot at booking. Billed after the owner approves."
                      : "Total at booking is this amount × number of guests. Billed after the owner approves."}
                  </p>
                  {fieldError("booking_fee") ? (
                    <p className="mt-1 text-xs text-red-600">{liveErrors.booking_fee}</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      {bookingFeeFullSlot
                        ? "Flat fee for the whole slot at booking. Billed after the owner approves."
                        : "Total at booking is this amount × number of guests. Billed after the owner approves."}
                    </p>
                  )}
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
                              onClick={() => setChoice("shared_billing_frequency", opt.value)}
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
                      {fieldError("shared_billing_frequency") ? (
                        <p className="mt-1 text-xs text-red-600">{liveErrors.shared_billing_frequency}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FormLabel required>Amount per resident</FormLabel>
                      <input
                        className={inputClass(fieldError("shared_billing_amount"))}
                        value={form.shared_billing_amount}
                        onChange={(e) => setField("shared_billing_amount", e.target.value.replace(/[^0-9.]/g, ""))}
                        onBlur={() => touch("shared_billing_amount")}
                        placeholder="e.g. 25"
                        inputMode="decimal"
                      />
                      {fieldError("shared_billing_amount") ? (
                        <p className="mt-1 text-xs text-red-600">{liveErrors.shared_billing_amount}</p>
                      ) : null}
                    </div>
                    <div>
                      <FormLabel required>Due day</FormLabel>
                      <select
                        className={inputClass(fieldError("shared_billing_due_day"))}
                        value={form.shared_billing_due_day}
                        onChange={(e) => setChoice("shared_billing_due_day", e.target.value)}
                        onBlur={() => touch("shared_billing_due_day")}
                      >
                        <option value="">Select day</option>
                        {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                          <option key={day} value={String(day)}>
                            {sharedBillingDueDayLabel(day)}
                          </option>
                        ))}
                      </select>
                      {fieldError("shared_billing_due_day") ? (
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
                <ReviewRow
                  label={form.status === "bookable" ? "People per time slot" : "Capacity / Limit"}
                  value={form.capacity.trim() || "—"}
                />
              ) : null}
              {form.status === "bookable" ? (
                <ReviewRow
                  label="Capacity booking type"
                  value={
                    form.capacity_booking_type === "full_slot"
                      ? "Book full slot"
                      : "Book per seat in a slot"
                  }
                />
              ) : null}
              <div className="sm:col-span-2">
                <ReviewRow label="Description" value={form.description.trim() || "None"} long />
              </div>
              <ReviewRow label="Availability" value={statusLabel(form.status)} />
              <ReviewRow
                label="Hours"
                long={(form.open_24_hours ? "Open 24 Hours / All Day" : form.hours.trim() || "—").length > 40}
                value={form.open_24_hours ? "Open 24 Hours / All Day" : form.hours.trim() || "—"}
              />
              <ReviewRow label="Weekends" value={form.weekends_available ? "Available" : "Closed"} />
              <ReviewRow
                label="Slot duration"
                value={
                  form.status === "bookable"
                    ? formatSlotDurationLabel(Number(form.slot_duration_minutes) || 0)
                    : "Not used"
                }
              />
              {showSharedBilling || form.status === "open" || form.status === "bookable" ? (
                <>
                  <ReviewRow
                    label="How residents pay"
                    value={
                      chargeModel === "monthly"
                        ? "Shared amenity"
                        : chargeModel === "booking"
                          ? "Per booking"
                          : chargeModel === "free"
                            ? "Free"
                            : "Not selected"
                    }
                  />
                  {chargeModel === "booking" ? (
                    <ReviewRow
                      label={bookingFeeFullSlot ? "Reservation fee per slot" : "Reservation fee per person"}
                      value={
                        Number(form.booking_fee) > 0
                          ? `${formatUsdAmount(Number(form.booking_fee))} / ${bookingFeeFullSlot ? "slot" : "person"}`
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
