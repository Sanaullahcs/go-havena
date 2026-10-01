import type { PublicRegion } from "@/lib/api/communities";

/** e.g. "Alabama - Abbeville" → "Abbeville, Alabama" */
export function formatRegionPlaceLabel(
  region: Pick<PublicRegion, "title" | "state_name" | "state"> | null | undefined,
): string {
  if (!region) return "your area";

  const state = (region.state_name ?? region.state ?? "").trim();
  const title = (region.title ?? "").trim();
  const dash = title.indexOf(" - ");
  if (dash >= 0) {
    const place = title.slice(dash + 3).trim();
    if (place && state) return `${place}, ${state}`;
    if (place) return place;
  }

  if (title && state) return `${title}, ${state}`;
  return title || state || "your area";
}
