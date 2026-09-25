import { AMENITY_ICON_KEYS } from "@/lib/admin/amenity-display";
import { parseHoursRange } from "@/lib/admin/hours-range-utils";

export const SHARED_BILLING_TYPE = "all_residents";
export const SHARED_BILLING_TYPE_LABEL = "All residents must pay";
export const SHARED_BILLING_FREQUENCY = "monthly";
export const SHARED_BILLING_FREQUENCY_YEARLY = "yearly";
export const SHARED_BILLING_FREQUENCY_LABEL = "Monthly";
export const SHARED_BILLING_FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

export function sharedBillingDueDayLabel(day: number, frequency: "monthly" | "yearly" | string = "monthly"): string {
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
  return `${day}${suffix} of each ${frequency === "yearly" ? "year" : "month"}`;
}

export type AmenityChargeModel = "free" | "booking" | "monthly";

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
  custom_category: string;
  charge_model: AmenityChargeModel;
  shared_billing_enabled: boolean;
  shared_billing_frequency: "monthly" | "yearly";
  shared_billing_amount: string;
  shared_billing_due_day: string;
  booking_fee: string;
};

export const AMENITY_FORM_STEPS = ["details", "availability", "billing", "review"] as const;
export type AmenityFormStep = (typeof AMENITY_FORM_STEPS)[number];

export const AMENITY_FORM_STEP_FIELDS: Record<Exclude<AmenityFormStep, "review">, (keyof AmenityForm)[]> = {
  details: ["name", "description", "floor", "icon_key", "custom_category"],
  availability: ["status", "capacity", "hours", "slot_duration_minutes", "booking_fee"],
  billing: ["booking_fee", "shared_billing_frequency", "shared_billing_amount", "shared_billing_due_day"],
};

export function amenityChargeModel(form: Pick<AmenityForm, "charge_model" | "shared_billing_enabled" | "booking_fee">): AmenityChargeModel {
  if (form.charge_model) return form.charge_model;
  if (form.shared_billing_enabled) return "monthly";
  if (Number(form.booking_fee) > 0) return "booking";
  return "free";
}

export function inferAmenityChargeModel(amenity: {
  shared_billing_enabled?: boolean | null;
  booking_fee?: number | string | null;
}): AmenityChargeModel {
  if (amenity.shared_billing_enabled) return "monthly";
  if (Number(amenity.booking_fee) > 0) return "booking";
  return "free";
}

export function applyAmenityChargeModel(form: AmenityForm, model: AmenityChargeModel): AmenityForm {
  if (model === "free") {
    return {
      ...form,
      charge_model: "free",
      shared_billing_enabled: false,
      shared_billing_frequency: "monthly",
      shared_billing_amount: "",
      shared_billing_due_day: "",
      booking_fee: "0",
    };
  }

  if (model === "booking") {
    return {
      ...form,
      charge_model: "booking",
      shared_billing_enabled: false,
      shared_billing_frequency: "monthly",
      shared_billing_amount: "",
      shared_billing_due_day: "",
      booking_fee: Number(form.booking_fee) > 0 ? form.booking_fee : "",
    };
  }

  return {
    ...form,
    charge_model: "monthly",
    shared_billing_enabled: true,
    shared_billing_frequency: form.shared_billing_frequency || "monthly",
    booking_fee: "0",
  };
}

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

export function visibleAmenityFormSteps(showSharedBilling: boolean, _billingEnabled = false): AmenityFormStep[] {
  const steps: AmenityFormStep[] = ["details", "availability"];
  if (showSharedBilling) steps.push("billing");
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

  if (form.status === "bookable") {
    if (capacityRaw === "") errors.capacity = "Capacity is required when Slots is selected.";
    else {
      const capacity = Number(capacityRaw);
      if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) {
        errors.capacity = "Capacity must be 0–1000.";
      }
    }
  } else if (capacityRaw !== "") {
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
  } else if (form.icon_key === "other" && !form.custom_category.trim()) {
    errors.custom_category = "Enter a custom category name.";
  }

  const feeRaw = form.charge_model === "monthly" || form.shared_billing_enabled ? "0" : form.booking_fee.trim();
  const fee = feeRaw === "" ? 0 : Number(feeRaw);
  if (form.charge_model !== "monthly" && !form.shared_billing_enabled) {
    if (feeRaw !== "" && (!Number.isFinite(fee) || fee < 0)) {
      errors.booking_fee = "Enter 0 or a valid booking fee.";
    } else if (form.charge_model === "booking" && (!Number.isFinite(fee) || fee <= 0)) {
      errors.booking_fee = "Pay-per-booking amenities need a fee greater than 0.";
    } else if (form.status === "closed" && fee > 0) {
      errors.booking_fee = "Closed amenities cannot have a booking fee.";
    }
  }

  if (form.shared_billing_enabled) {
    if (form.shared_billing_frequency !== "monthly" && form.shared_billing_frequency !== "yearly") {
      errors.shared_billing_frequency = "Choose monthly or yearly billing.";
    }

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
    capacity: form.capacity.trim() === "" ? null : Math.max(0, parseInt(form.capacity, 10) || 0),
    floor: form.floor.trim() || null,
    hours: form.hours.trim() || null,
    start_time: range.open || null,
    end_time: range.close || null,
    weekends_available: Boolean(form.weekends_available),
    slot_duration_minutes:
      form.status === "bookable" ? Number(form.slot_duration_minutes) || 60 : null,
    icon_key: form.icon_key,
    custom_category: form.icon_key === "other" ? form.custom_category.trim() : null,
    shared_billing_enabled: Boolean(form.shared_billing_enabled),
    shared_billing_type: form.shared_billing_enabled ? SHARED_BILLING_TYPE : null,
    shared_billing_frequency: form.shared_billing_enabled
      ? (form.shared_billing_frequency === "yearly" ? "yearly" : "monthly")
      : null,
    shared_billing_amount: form.shared_billing_enabled
      ? Number(form.shared_billing_amount)
      : null,
    shared_billing_due_day: form.shared_billing_enabled
      ? Number(form.shared_billing_due_day)
      : null,
    booking_fee: form.shared_billing_enabled || form.charge_model === "monthly"
      ? 0
      : feeRaw === ""
        ? 0
        : Number(form.booking_fee),
  };
}
