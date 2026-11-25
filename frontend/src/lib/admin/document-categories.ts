export const DOCUMENT_OTHER_CATEGORY = "Others";

export const DOCUMENT_PRESET_CATEGORIES = [
  "Rules & Policies",
  "Maintenance",
  "Financial",
  "Property",
] as const;

/** @deprecated Use DOCUMENT_PRESET_CATEGORIES */
export const PRESET_DOCUMENT_CATEGORIES = DOCUMENT_PRESET_CATEGORIES;

export function isPresetDocumentCategory(value: string): boolean {
  const key = value.trim().toLowerCase();
  return DOCUMENT_PRESET_CATEGORIES.some((name) => name.toLowerCase() === key);
}

export function isDocumentOtherCategory(value: string): boolean {
  const key = value.trim().toLowerCase();
  return key === "other" || key === "others";
}

/** The four named categories, then Others for a custom name. */
export function buildDocumentCategoryOptions(_managedNames: string[] = []): string[] {
  return [...DOCUMENT_PRESET_CATEGORIES, DOCUMENT_OTHER_CATEGORY];
}

export function documentMatchesCategory(category: string, filter: string): boolean {
  if (!filter || filter === "all") return true;
  if (isDocumentOtherCategory(filter)) return !isPresetDocumentCategory(category);
  return category.trim().toLowerCase() === filter.trim().toLowerCase();
}

export function resolveDocumentCategory(selection: string, customName: string): string {
  if (isDocumentOtherCategory(selection)) return customName.trim();
  return selection.trim();
}

export function splitDocumentCategory(
  stored: string,
  managedNames: string[] = [],
): { selection: string; customName: string } {
  const value = stored.trim();
  if (!value) return { selection: "", customName: "" };
  const known = buildDocumentCategoryOptions(managedNames).filter((name) => !isDocumentOtherCategory(name));
  const exact = known.find((name) => name.toLowerCase() === value.toLowerCase());
  if (exact) return { selection: exact, customName: "" };
  return { selection: DOCUMENT_OTHER_CATEGORY, customName: value };
}
