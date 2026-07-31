export const DOCUMENT_OTHER_CATEGORY = "Other";

/** @deprecated Kept for reference — not shown in the document form. */
export const DOCUMENT_PRESET_CATEGORIES = [
  "Rules & Policies",
  "Forms",
  "Guidelines",
  "Safety",
  "Maps & Diagrams",
  "Financial",
  DOCUMENT_OTHER_CATEGORY,
] as const;

/** @deprecated Use DOCUMENT_PRESET_CATEGORIES */
export const PRESET_DOCUMENT_CATEGORIES = DOCUMENT_PRESET_CATEGORIES;

/**
 * Form options = community-managed categories only + Other.
 * Hardcoded presets are NOT merged.
 */
export function buildDocumentCategoryOptions(managedNames: string[]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const name of managedNames) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.toLowerCase() === DOCUMENT_OTHER_CATEGORY.toLowerCase()) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(trimmed);
  }

  options.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  options.push(DOCUMENT_OTHER_CATEGORY);
  return options;
}

export function resolveDocumentCategory(selection: string, customName: string): string {
  if (selection === DOCUMENT_OTHER_CATEGORY) return customName.trim();
  return selection.trim();
}

export function splitDocumentCategory(
  stored: string,
  managedNames: string[] = [],
): { selection: string; customName: string } {
  const value = stored.trim();
  const exact = managedNames.find((n) => n.trim().toLowerCase() === value.toLowerCase());
  if (exact) {
    return { selection: exact, customName: "" };
  }
  return { selection: DOCUMENT_OTHER_CATEGORY, customName: value };
}
