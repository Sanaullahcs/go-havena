export const DOCUMENT_OTHER_CATEGORY = "Others";

export const DOCUMENT_PRESET_CATEGORIES = [
  "Rules & Policies",
  "Maintenance",
  "Legal",
  "Financial",
  "Property",
  "Community Notices",
  "Consent Forms",
  "Agreements",
];

/** @deprecated Use DOCUMENT_PRESET_CATEGORIES */
export const PRESET_DOCUMENT_CATEGORIES = DOCUMENT_PRESET_CATEGORIES;

export function isDocumentOtherCategory(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return key === "other" || key === "others";
}

/**
 * Preset categories, then any extra names already used by the community, then Others.
 */
export function buildDocumentCategoryOptions(managedNames = []) {
  const seen = new Set(DOCUMENT_PRESET_CATEGORIES.map((name) => name.toLowerCase()));
  const extras = [];

  for (const name of managedNames) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed || isDocumentOtherCategory(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push(trimmed);
  }

  extras.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return [...DOCUMENT_PRESET_CATEGORIES, ...extras, DOCUMENT_OTHER_CATEGORY];
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
