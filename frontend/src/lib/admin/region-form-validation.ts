import axios from "axios";
import { apiFieldErrors } from "@/lib/api/client";
import type { FieldErrors } from "@/lib/admin/form-validation-utils";
import { fetchRegions, type Region } from "@/lib/api/regions";

export const DUPLICATE_REGION_TITLE = "Region already exists";

export const DUPLICATE_REGION_MESSAGE =
  "A service region for this state and city is already in the system. Edit the existing region from the list, or choose a different city.";

export type RegionFormLike = {
  title: string;
  city: string;
  country_id: number | "";
  state_id: number | "";
};

export function validateRegionForm(form: RegionFormLike): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.country_id) {
    errors.country_id = "Country is required.";
  }

  if (!form.state_id) {
    errors.state_id = "State / province is required.";
  }

  if (!form.title.trim()) {
    errors.title = "Title is required.";
  }

  if (!form.city.trim()) {
    errors.city = "City is required.";
  }

  return errors;
}

function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

/** Active city-level region for the same state + city (any status in admin index). */
export async function findDuplicateCityRegion(
  stateId: number,
  city: string,
  exceptId?: number | null,
): Promise<Region | null> {
  const needle = normalizeCity(city);
  if (!stateId || !needle) return null;

  const res = await fetchRegions({ state_id: stateId, per_page: 100, status: "active" });
  const match = res.data.find(
    (row) => row.id !== exceptId && row.status === "active" && normalizeCity(row.area) === needle,
  );
  return match ?? null;
}

export function isDuplicateRegionApiError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const fields = apiFieldErrors(err);
  const area = fields.area ?? "";
  if (/already exists/i.test(area)) return true;
  const message = (err.response?.data as { message?: string } | undefined)?.message ?? "";
  return /already exists/i.test(message) && /region|city/i.test(message);
}

export function duplicateRegionPopupMessage(existingTitle?: string | null): string {
  if (existingTitle?.trim()) {
    return `"${existingTitle.trim()}" is already set up for this city. ${DUPLICATE_REGION_MESSAGE}`;
  }
  return DUPLICATE_REGION_MESSAGE;
}
