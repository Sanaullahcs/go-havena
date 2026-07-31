export const RULE_OTHER_CATEGORY = "Other";

/** @deprecated Not shown in the rule form — use community-managed categories from the API. */
export const RULE_PRESET_CATEGORIES = [
  "Noise & Quiet Hours",
  "Pet Regulations",
  "Common Areas",
  "Parking",
  "Waste Management",
  "Safety & Security",
  "Balcony & Exterior",
  "Renovations",
  "Guests & Visitors",
  RULE_OTHER_CATEGORY,
];

/**
 * Rule form options = community-managed categories only + Other.
 * Do not merge hardcoded presets (avoids duplicate Noise / Noise & Quiet Hours lists).
 */
export function buildCategoryOptions(managedNames = []) {
  const seen = new Set();
  const options = [];

  for (const name of managedNames) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed || trimmed.toLowerCase() === RULE_OTHER_CATEGORY.toLowerCase()) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(trimmed);
  }

  options.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  options.push(RULE_OTHER_CATEGORY);
  return options;
}

export function resolveRuleCategory(selection, customName) {
  if (selection === RULE_OTHER_CATEGORY) return String(customName ?? "").trim();
  return String(selection ?? "").trim();
}

export function splitRuleCategory(stored, managedNames = []) {
  const value = String(stored ?? "").trim();
  const exact = managedNames.find(
    (n) => String(n ?? "").trim().toLowerCase() === value.toLowerCase(),
  );
  if (exact) {
    return { selection: exact, customName: "" };
  }
  return { selection: RULE_OTHER_CATEGORY, customName: value };
}
