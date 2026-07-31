import { AMENITY_ICON_KEYS } from "@/lib/admin/amenity-display";
import { parseHoursRange } from "@/lib/admin/hours-range-utils";

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
};

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

  return errors;
}

export function amenityFormToPayload(form: AmenityForm) {
  const range = parseHoursRange(form.hours);

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
  };
}
