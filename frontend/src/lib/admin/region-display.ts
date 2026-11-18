import type { PublicRegion } from "@/lib/api/communities";

/** Prefer API hierarchy_label; else parse "Country - State - City" titles. */
export function formatRegionPlaceLabel(
  region:
    | (Pick<PublicRegion, "title" | "state_name" | "state"> & {
        hierarchy_label?: string | null;
        country_name?: string | null;
        area?: string | null;
      })
    | null
    | undefined,
): string {
  if (!region) return "your area";

  const hierarchy = (region.hierarchy_label ?? "").trim();
  if (hierarchy) return hierarchy;

  const state = (region.state_name ?? region.state ?? "").trim();
  const city = (region.area ?? "").trim();
  const title = (region.title ?? "").trim();
  const segments = title.split(" - ").map((part) => part.trim()).filter(Boolean);

  if (segments.length >= 3) {
    return segments.join(" - ");
  }

  if (segments.length === 2 && city && state) {
    return `${segments[0]} - ${state} - ${city}`;
  }

  const dash = title.indexOf(" - ");
  if (dash >= 0) {
    const place = title.slice(dash + 3).trim();
    if (place && state) return `${place}, ${state}`;
    if (place) return place;
  }

  if (city && state) return `${state} - ${city}`;
  if (title && state) return `${title}, ${state}`;
  return title || state || city || "your area";
}
