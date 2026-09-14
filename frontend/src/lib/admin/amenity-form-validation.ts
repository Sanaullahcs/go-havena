import { AMENITY_ICON_KEYS } from "@/lib/admin/amenity-display";
import { parseHoursRange } from "@/lib/admin/hours-range-utils";

export const SHARED_BILLING_TYPE = "all_residents";
export const SHARED_BILLING_TYPE_LABEL = "All residents must pay";
export const SHARED_BILLING_FREQUENCY = "monthly";
export const SHARED_BILLING_FREQUENCY_LABEL = "Monthly";

export function sharedBillingDueDayLabel(day: number): string {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix} of each month`;
}

export type AmenityForm = {
  name: string;
  description: string;
  status: "open" | "bookable" | "closed";
  capacity: string;
  floor: string;
  hours: string;
  weekends_available: boolean;
  slot_duration_minutes: string;
  icon_key: string;
  shared_billing_enabled: boolean;
  shared_billing_amount: string;
  shared_billing_due_day: string;
  booking_fee: string;
};

export const AMENITY_FORM_STEPS = ["details", "availability", "billing", "review"] as const;
export type AmenityFormStep = (typeof AMENITY_FORM_STEPS)[number];

export const AMENITY_FORM_STEP_FIELDS: Record<Exclude<AmenityFormStep, "review">, (keyof AmenityForm)[]> = {
  details: ["name", "description", "floor", "capacity", "icon_key"],
  availability: ["status", "hours", "slot_duration_minutes", "booking_fee"],
  billing: ["shared_billing_amount", "shared_billing_due_day"],
};

export function amenityFormStepErrors(
  form: AmenityForm,
  step: Exclude<AmenityFormStep, "review">,
): Record<string, string> {
  const all = validateAmenityForm(form);
  const errors: Record<string, string> = {};
  for (const field of AMENITY_FORM_STEP_FIELDS[step]) {
    if (all[field]) errors[field] = all[field];
  }
  return errors;
}

export function visibleAmenityFormSteps(showSharedBilling: boolean, billingEnabled: boolean): AmenityFormStep[] {
  const steps: AmenityFormStep[] = ["details", "availability"];
  if (showSharedBilling && billingEnabled) steps.push("billing");
  steps.push("review");
  return steps;
}

export function validateAmenityForm(form: AmenityForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  const description = form.description.trim();
  const capacityRaw = form.capacity.trim();
  const floor = form.floor.trim();
  const hours = form.hours.trim();
  const slotDuration = Number(form.slot_duration_minutes);

  if (!name) errors.name = "Name is required.";
  else if (name.length < 2) errors.name = "Use at least 2 characters.";
  else if (name.length > 100) errors.name = "Keep the name under 100 characters.";

  if (description.length > 2000) errors.description = "Description is too long.";

  if (!["open", "bookable", "closed"].includes(form.status)) {
    errors.status = "Choose an availability option.";
  }

  if (capacityRaw === "") errors.capacity = "Capacity is required.";
  else {
    const capacity = Number(capacityRaw);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) {
      errors.capacity = "Capacity must be 0–1000.";
    }
  }

  if (!floor) errors.floor = "Location is required.";
  else if (floor.length > 40) errors.floor = "Keep location under 40 characters.";

  if (!hours) errors.hours = "Open and close times are required.";
  else {
    const range = parseHoursRange(hours);
    if (!range.open || !range.close) {
      errors.hours = "Use a valid open–close time range.";
    }
  }

  if (form.status === "bookable" && ![30, 60, 90, 120].includes(slotDuration)) {
    errors.slot_duration_minutes = "Choose a slot duration.";
  }

  if (!form.icon_key || !AMENITY_ICON_KEYS.includes(form.icon_key)) {
    errors.icon_key = "Category is required.";
  }

  const feeRaw = form.booking_fee.trim();
  if (feeRaw !== "") {
    const fee = Number(feeRaw);
    if (!Number.isFinite(fee) || fee < 0) {
      errors.booking_fee = "Enter 0 or a valid booking fee.";
    }
  }

  if (form.shared_billing_enabled) {
    const amount = Number(form.shared_billing_amount);
    if (!form.shared_billing_amount.trim()) {
      errors.shared_billing_amount = "Amount per resident is required.";
    } else if (!Number.isFinite(amount) || amount < 0.01) {
      errors.shared_billing_amount = "Enter an amount greater than 0.";
    }

    const dueDay = Number(form.shared_billing_due_day);
    if (!form.shared_billing_due_day.trim()) {
      errors.shared_billing_due_day = "Due day is required.";
    } else if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      errors.shared_billing_due_day = "Choose a due day between 1 and 31.";
    }
  }

  return errors;
}

export function amenityFormToPayload(form: AmenityForm) {
  const range = parseHoursRange(form.hours);
  const feeRaw = form.booking_fee.trim();

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    status: form.status,
    capacity: Math.max(0, parseInt(form.capacity, 10) || 0),
    floor: form.floor.trim() || null,
    hours: form.hours.trim() || null,
    start_time: range.open || null,
    end_time: range.close || null,
    weekends_available: Boolean(form.weekends_available),
    slot_duration_minutes:
      form.status === "bookable" ? Number(form.slot_duration_minutes) || 60 : null,
    icon_key: form.icon_key,
    shared_billing_enabled: Boolean(form.shared_billing_enabled),
    shared_billing_type: form.shared_billing_enabled ? SHARED_BILLING_TYPE : null,
    shared_billing_frequency: form.shared_billing_enabled ? SHARED_BILLING_FREQUENCY : null,
    shared_billing_amount: form.shared_billing_enabled
      ? Number(form.shared_billing_amount)
      : null,
    shared_billing_due_day: form.shared_billing_enabled
      ? Number(form.shared_billing_due_day)
      : null,
    booking_fee: feeRaw === "" ? 0 : Number(form.booking_fee),
  };
}
