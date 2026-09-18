/** Shared deal-menu helpers used by Resident and Community Admin create/edit flows. */

export const DEAL_MENU_LIMITS = {
  name: 120,
  description: 500,
  price: 40,
  maxItems: 50,
};

export function createMenuItemId() {
  return `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyMenuItem() {
  return {
    id: createMenuItemId(),
    name: "",
    description: "",
    price: "",
    imageFile: null,
    imageUrl: null,
  };
}

export function menuItemsFromApi(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && String(item.name ?? "").trim())
    .map((item) => ({
      id: item.id ? String(item.id) : createMenuItemId(),
      name: String(item.name ?? ""),
      description: String(item.description ?? ""),
      price: item.price == null ? "" : String(item.price),
      imageFile: null,
      imageUrl: item.image_url ?? item.imageUrl ?? null,
    }));
}

export function menuItemPreviewUri(item) {
  return item?.imageFile?.uri || item?.imageUrl || null;
}

export function draftFromMenuItem(item) {
  return {
    name: item?.name ?? "",
    description: item?.description ?? "",
    price: item?.price ?? "",
    imageFile: item?.imageFile ?? null,
    imageUrl: item?.imageUrl ?? null,
  };
}

export function isBlankMenuDraft(draft) {
  return (
    !String(draft?.name ?? "").trim() &&
    !String(draft?.description ?? "").trim() &&
    !String(draft?.price ?? "").trim() &&
    !draft?.imageFile &&
    !draft?.imageUrl
  );
}

export function mergeDraftIntoItem(item, draft) {
  return {
    ...(item ?? createEmptyMenuItem()),
    name: String(draft.name ?? "").trim(),
    description: String(draft.description ?? "").trim(),
    price: String(draft.price ?? "").trim(),
    imageFile: draft.imageFile ?? null,
    imageUrl: draft.imageFile ? null : (draft.imageUrl ?? item?.imageUrl ?? null),
  };
}
