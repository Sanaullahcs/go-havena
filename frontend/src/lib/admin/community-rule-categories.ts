export const RULE_OTHER_CATEGORY = "Other";

/** @deprecated Kept for reference / older seeds — not shown in the rule form. */
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
] as const;

/**
 * Rule form options = community-managed categories only + Other.
 * Hardcoded presets are NOT merged (that caused duplicate Noise / Noise & Quiet Hours lists).
 */
export function buildCategoryOptions(managedNames: string[]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const name of managedNames) {
    const trimmed = name.trim();
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

export function resolveRuleCategory(selection: string, customName: string): string {
  if (selection === RULE_OTHER_CATEGORY) return customName.trim();
  return selection.trim();
}

export function splitRuleCategory(
  stored: string,
  managedNames: string[] = [],
): { selection: string; customName: string } {
  const value = stored.trim();
  const exact = managedNames.find((n) => n.trim().toLowerCase() === value.toLowerCase());
  if (exact) {
    return { selection: exact, customName: "" };
  }
  return { selection: RULE_OTHER_CATEGORY, customName: value };
}
