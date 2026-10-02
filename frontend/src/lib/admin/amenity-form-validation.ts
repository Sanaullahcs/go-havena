import { AMENITY_ICON_KEYS } from "@/lib/admin/amenity-display";
import {
  amenityHoursFitSlotDuration,
  isValidAmenitySlotDurationMinutes,
} from "@/lib/admin/amenity-slot-duration";
import {
  OPEN_24_HOURS_LABEL,
  buildScheduleHours,
  clockMinutes,
  isNextScheduleDay,
  isSameScheduleDay,
  parseHoursRange,
} from "@/lib/admin/hours-range-utils";

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
export type AmenityFormChargeModel = AmenityChargeModel | "";

export type AmenityForm = {
  name: string;
  description: string;
  status: "open" | "bookable" | "closed";
  capacity: string;
  capacity_booking_type?: "per_seat" | "full_slot";
  floor: string;
  hours: string;
  opening_date?: string;
  closing_date?: string;
  open_24_hours?: boolean;
  weekends_available: boolean;
  slot_duration_minutes: string;
  icon_key: string;
  custom_category: string;
  charge_model: AmenityFormChargeModel;
  shared_billing_enabled: boolean;
  shared_billing_frequency: "monthly" | "yearly";
  shared_billing_amount: string;
  shared_billing_due_day: string;
  booking_fee: string;
};

export const AMENITY_FIELD_MAX = {
  name: 100,
  description: 500,
  floor: 40,
  custom_category: 80,
} as const;

export const AMENITY_FORM_STEPS = ["details", "availability", "billing", "review"] as const;
export type AmenityFormStep = (typeof AMENITY_FORM_STEPS)[number];

export const AMENITY_FORM_STEP_FIELDS: Record<Exclude<AmenityFormStep, "review">, (keyof AmenityForm)[]> = {
  details: ["name", "description", "floor", "icon_key", "custom_category"],
  availability: ["status", "capacity", "capacity_booking_type", "hours", "slot_duration_minutes", "booking_fee"],
  billing: ["charge_model", "booking_fee", "shared_billing_frequency", "shared_billing_amount", "shared_billing_due_day"],
};

export function amenityChargeModel(
  form: Pick<AmenityForm, "charge_model" | "shared_billing_enabled" | "booking_fee">,
): AmenityFormChargeModel {
  if (form.charge_model) return form.charge_model;
  if (form.shared_billing_enabled) return "monthly";
  if (Number(form.booking_fee) > 0) return "booking";
  return "";
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
  showSharedBilling = false,
): Record<string, string> {
  const all = validateAmenityForm(form);
  const fields: Array<keyof AmenityForm> = [...AMENITY_FORM_STEP_FIELDS[step]];
  if (step === "availability" && !showSharedBilling) {
    fields.push("charge_model");
  }
  const errors: Record<string, string> = {};
  for (const field of fields) {
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

/** Letters, numbers, spaces, and a single - & or ' between them. */
function isValidAmenityName(value: string): boolean {
  if (!/^[\p{L}\p{N} &'’-]+$/u.test(value)) return false;
  if (!/^[\p{L}\p{N}]/u.test(value) || !/[\p{L}\p{N}]$/u.test(value)) return false;
  if (/[-&'’]{2,}/u.test(value)) return false;
  return true;
}

/** Letters, numbers, spaces, and address marks - / , . # without leading or repeated punctuation. */
function isValidAmenityLocation(value: string): boolean {
  if (!/^[\p{L}\p{N} \-\/,\.#]+$/u.test(value)) return false;
  if (!/[\p{L}\p{N}]/u.test(value)) return false;
  if (/^[,.\-\/]/u.test(value)) return false;
  if (/[,#\-\/]$/u.test(value)) return false;
  if (/[-/,.#]{2,}/u.test(value)) return false;
  return true;
}

function amenityCapacityError(raw: string, required: boolean): string | undefined {
  if (raw === "") return required ? "Capacity is required when Slots is selected." : undefined;
  const capacity = Number(raw);
  if (!Number.isInteger(capacity) || capacity < 1) return "Capacity must be at least 1.";
  if (capacity > 1000) return "Capacity must be 1–1000.";
  return undefined;
}

export function validateAmenityForm(form: AmenityForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  const capacityRaw = form.capacity.trim();
  const floor = form.floor.trim();
  const hours = form.hours.trim();
  const slotDuration = Number(form.slot_duration_minutes);

  if (form.name.length > AMENITY_FIELD_MAX.name) errors.name = "Keep the name under 100 characters.";
  else if (!name) errors.name = "Name is required.";
  else if (name.length < 2) errors.name = "Use at least 2 characters.";

  if (form.description.length > AMENITY_FIELD_MAX.description) {
    errors.description = "Description must be 500 characters or fewer.";
  }

  if (!["open", "bookable", "closed"].includes(form.status)) {
    errors.status = "Choose an availability option.";
  }

  if (form.status === "bookable") {
    const capacityError = amenityCapacityError(capacityRaw, true);
    if (capacityError) errors.capacity = capacityError;
    if (form.capacity_booking_type && form.capacity_booking_type !== "per_seat" && form.capacity_booking_type !== "full_slot") {
      errors.capacity_booking_type = "Choose how capacity is booked.";
    }
  } else if (form.status !== "open" && capacityRaw !== "") {
    const capacityError = amenityCapacityError(capacityRaw, false);
    if (capacityError) errors.capacity = capacityError;
  } else if (capacityRaw !== "") {
    const capacity = Number(capacityRaw);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) {
      errors.capacity = "Capacity must be 0–1000.";
    }
  }

  if (form.floor.length > AMENITY_FIELD_MAX.floor) errors.floor = "Keep location under 40 characters.";
  else if (!floor) errors.floor = "Location is required.";

  if (form.custom_category.length > AMENITY_FIELD_MAX.custom_category) {
    errors.custom_category = "Keep the custom category under 80 characters.";
  } else if (form.icon_key === "other" && !form.custom_category.trim()) {
    errors.custom_category = "Enter a custom category name.";
  }

  if (form.open_24_hours) {
    // An explicit all-day choice. Identical clock times are not used.
  } else if (!hours) errors.hours = "Open and close times are required.";
  else {
    const range = parseHoursRange(hours);
    const openingDate = form.opening_date ?? "";
    const closingDate = form.closing_date ?? "";
    if (!range.open || !range.close) {
      errors.hours = "Use a valid open–close time range.";
    } else if (range.open === range.close && isSameScheduleDay(openingDate, closingDate)) {
      errors.hours = "Opening and closing times cannot be the same.";
    } else if (openingDate && closingDate && !isSameScheduleDay(openingDate, closingDate) && !isNextScheduleDay(openingDate, closingDate)) {
      errors.hours = "Closing must be on the opening day or the next day.";
    } else if (
      isNextScheduleDay(openingDate, closingDate) &&
      clockMinutes(range.close) > clockMinutes(range.open)
    ) {
      errors.hours = "A next-day closing time cannot be later than the opening time.";
    }
  }

  if (form.status === "bookable") {
    if (!isValidAmenitySlotDurationMinutes(slotDuration)) {
      errors.slot_duration_minutes = "Enter a duration between 15 minutes and 8 hours.";
    } else {
      const range = parseHoursRange(form.hours);
      if (range.open && range.close && !amenityHoursFitSlotDuration(range.open, range.close, slotDuration)) {
        errors.slot_duration_minutes = "No slots fit within these hours — choose a shorter duration.";
      }
    }
  }

  if (!form.icon_key || !AMENITY_ICON_KEYS.includes(form.icon_key)) {
    errors.icon_key = "Category is required.";
  }

  const feeRaw = form.charge_model === "monthly" || form.shared_billing_enabled ? "0" : form.booking_fee.trim();
  const fee = feeRaw === "" ? 0 : Number(feeRaw);
  if (form.status === "bookable" || form.status === "open") {
    if (!form.charge_model) {
      errors.charge_model = "Choose how residents pay.";
    }
  }
  if (form.charge_model === "booking") {
    if (!feeRaw || !Number.isFinite(fee) || fee <= 0) {
      errors.booking_fee =
        form.capacity_booking_type === "full_slot"
          ? "Enter a reservation fee per slot greater than 0."
          : "Enter a reservation fee per person greater than 0.";
    } else if (form.status === "closed") {
      errors.booking_fee = "Closed amenities cannot have a booking fee.";
    } else if (Math.round(fee * 100) > 99_999_999) {
      errors.booking_fee = "Booking fee must not exceed 999,999.99.";
    }
  } else if (form.charge_model !== "monthly" && !form.shared_billing_enabled) {
    if (feeRaw !== "" && (!Number.isFinite(fee) || fee < 0)) {
      errors.booking_fee = "Enter 0 or a valid booking fee.";
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
  const openingDate = form.opening_date ?? "";
  const closingDate = form.closing_date ?? "";
  const open24Hours = Boolean(form.open_24_hours);
  const closesNextDay = !open24Hours && isNextScheduleDay(openingDate, closingDate);
  const hours = open24Hours
    ? OPEN_24_HOURS_LABEL
    : closesNextDay
      ? buildScheduleHours(range.open, range.close, openingDate, closingDate)
      : form.hours.trim() || null;

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    status: form.status,
    capacity: form.capacity.trim() === "" ? null : Math.max(0, parseInt(form.capacity, 10) || 0),
    capacity_booking_type: form.capacity_booking_type === "full_slot" ? "full_slot" : "per_seat",
    floor: form.floor.trim() || null,
    hours,
    start_time: open24Hours ? "00:00" : range.open || null,
    end_time: open24Hours ? "00:00" : range.close || null,
    ...(open24Hours ? { open_24_hours: true } : {}),
    ...(closesNextDay
      ? { closes_next_day: true, opening_date: openingDate, closing_date: closingDate }
      : {}),
    weekends_available: Boolean(form.weekends_available),
    slot_duration_minutes:
      form.status === "bookable" ? Number(form.slot_duration_minutes) || 60 : null,
    icon_key: form.icon_key,
    custom_category: form.icon_key === "other" ? form.custom_category.trim() : null,
    shared_billing_enabled: form.charge_model === "monthly" || Boolean(form.shared_billing_enabled),
    shared_billing_type: form.charge_model === "monthly" || form.shared_billing_enabled ? SHARED_BILLING_TYPE : null,
    shared_billing_frequency: form.charge_model === "monthly" || form.shared_billing_enabled
      ? (form.shared_billing_frequency === "yearly" ? "yearly" : "monthly")
      : null,
    shared_billing_amount: form.charge_model === "monthly" || form.shared_billing_enabled
      ? Number(form.shared_billing_amount)
      : null,
    shared_billing_due_day: form.charge_model === "monthly" || form.shared_billing_enabled
      ? Number(form.shared_billing_due_day)
      : null,
    booking_fee: form.charge_model === "booking"
      ? (feeRaw === "" ? 0 : Number(form.booking_fee))
      : 0,
  };
}
