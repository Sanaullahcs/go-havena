export const DOCUMENT_OTHER_CATEGORY = "Other";

/** @deprecated Not shown in the form — use community-managed categories from the API. */
export const DOCUMENT_PRESET_CATEGORIES = [
  "Rules & Policies",
  "Forms",
  "Guidelines",
  "Safety",
  "Maps & Diagrams",
  "Financial",
  DOCUMENT_OTHER_CATEGORY,
];

/** @deprecated Use DOCUMENT_PRESET_CATEGORIES */
export const PRESET_DOCUMENT_CATEGORIES = DOCUMENT_PRESET_CATEGORIES;

/**
 * Form options = community-managed categories only + Other.
 */
export function buildDocumentCategoryOptions(managedNames = []) {
  const seen = new Set();
  const options = [];

  for (const name of managedNames) {
    const trimmed = String(name ?? "").trim();
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

export function resolveDocumentCategory(selection, customName) {
  if (selection === DOCUMENT_OTHER_CATEGORY) return String(customName ?? "").trim();
  return String(selection ?? "").trim();
}

export function splitDocumentCategory(stored, managedNames = []) {
  const value = String(stored ?? "").trim();
  const exact = managedNames.find(
    (n) => String(n ?? "").trim().toLowerCase() === value.toLowerCase(),
  );
  if (exact) {
    return { selection: exact, customName: "" };
  }
  return { selection: DOCUMENT_OTHER_CATEGORY, customName: value };
}
