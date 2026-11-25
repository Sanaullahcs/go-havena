/** Keep in sync with backend DocumentCategories::PRESETS and frontend document-categories.ts */

export const DOCUMENT_OTHER_CATEGORY = "Others";

export const DOCUMENT_PRESET_CATEGORIES = [
  "Rules & Policies",
  "Maintenance",
  "Financial",
  "Property",
];

/** @deprecated Use DOCUMENT_PRESET_CATEGORIES */
export const PRESET_DOCUMENT_CATEGORIES = DOCUMENT_PRESET_CATEGORIES;

export function isPresetDocumentCategory(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return DOCUMENT_PRESET_CATEGORIES.some((name) => name.toLowerCase() === key);
}

export function isDocumentOtherCategory(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return key === "other" || key === "others";
}

/** The four named categories, then Others for a custom name — matches Community Admin. */
export function buildDocumentCategoryOptions(_managedNames = []) {
  return [...DOCUMENT_PRESET_CATEGORIES, DOCUMENT_OTHER_CATEGORY];
}

/** Filter helper: Others matches any non-preset stored category. */
export function documentMatchesCategory(category, filter) {
  if (!filter || filter === "all") return true;
  if (isDocumentOtherCategory(filter)) return !isPresetDocumentCategory(category);
  return String(category ?? "").trim().toLowerCase() === String(filter ?? "").trim().toLowerCase();
}

export function resolveDocumentCategory(selection, customName) {
  if (isDocumentOtherCategory(selection)) return String(customName ?? "").trim();
  return String(selection ?? "").trim();
}

export function splitDocumentCategory(stored, managedNames = []) {
  const value = String(stored ?? "").trim();
  if (!value) return { selection: "", customName: "" };
  const known = buildDocumentCategoryOptions(managedNames).filter((name) => !isDocumentOtherCategory(name));
  const exact = known.find((name) => name.toLowerCase() === value.toLowerCase());
  if (exact) return { selection: exact, customName: "" };
  return { selection: DOCUMENT_OTHER_CATEGORY, customName: value };
}
