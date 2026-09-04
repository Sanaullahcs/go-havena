export const LOCATION_RADIUS_MILES = [2, 3, 5, 10];

export const THIS_COMMUNITY_RADIUS = 0;

/** First-open default so nearby shops outside the building are visible. */
export const DEFAULT_RADIUS_MILES = 2;

export function isAllowedRadius(miles) {
  const value = Number(miles);
  if (value === THIS_COMMUNITY_RADIUS) return true;
  return LOCATION_RADIUS_MILES.includes(value);
}

export function normalizeRadius(miles) {
  const value = Number(miles);
  return isAllowedRadius(value) ? value : THIS_COMMUNITY_RADIUS;
}

export function formatMilesLabel(miles) {
  const value = Number(miles);
  if (!Number.isFinite(value) || value <= 0) return "";
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} mi`;
}

export function compactRadiusLabel(miles) {
  const value = Number(miles);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${value} mi`;
}

export function walkingMinutes(miles) {
  const value = Number(miles);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.round(value * 20));
}

/** Smallest saved radius that still includes this distance. */
export function coveringRadius(miles) {
  const value = Number(miles);
  if (!Number.isFinite(value) || value <= 0) return THIS_COMMUNITY_RADIUS;
  for (const option of LOCATION_RADIUS_MILES) {
    if (value <= option + 0.08) return option;
  }
  return LOCATION_RADIUS_MILES[LOCATION_RADIUS_MILES.length - 1];
}

export function radiusChipIcon(miles) {
  if (miles <= 0) return "home";
  if (miles <= 2) return "navigation";
  if (miles <= 3) return "map";
  if (miles <= 5) return "compass";
  return "globe";
}

export function categoryIcon(category) {
  const value = String(category || "").toLowerCase();
  if (value.includes("cafe") || value.includes("coffee")) return "coffee";
  if (value.includes("fitness") || value.includes("gym")) return "activity";
  if (value.includes("spa") || value.includes("beauty") || value.includes("salon")) return "sun";
  if (value.includes("restaurant") || value.includes("pizza") || value.includes("food")) return "heart";
  if (value.includes("grocery") || value.includes("market")) return "shopping-bag";
  return "map-pin";
}
