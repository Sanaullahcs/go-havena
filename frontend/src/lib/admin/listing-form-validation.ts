import type { FieldErrors } from "@/lib/admin/form-validation-utils";

const LIMITS = {
  listingTitle: 200,
  listingCategory: 60,
  listingLocation: 160,
};

function requiredText(value: string, label: string, max?: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (max != null && trimmed.length > max) return `${label} must be ${max} characters or less.`;
  return null;
}

export type ListingFormLike = {
  type: string;
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  location: string;
};

export function validateListingForm(
  form: ListingFormLike,
  opts: { photoCount: number },
): FieldErrors {
  const errors: FieldErrors = {};

  const titleErr = requiredText(form.title, "Title", LIMITS.listingTitle);
  if (titleErr) errors.title = titleErr;

  const descErr = requiredText(form.description, "Description");
  if (descErr) errors.description = descErr;

  const priceRaw = form.price.trim();
  if (!priceRaw) {
    errors.price = "Price is required.";
  } else if (Number.isNaN(Number(priceRaw)) || Number(priceRaw) < 0) {
    errors.price = "Enter a valid price (0 or greater).";
  }

  const catErr = requiredText(form.category, "Category", LIMITS.listingCategory);
  if (catErr) errors.category = catErr;

  if (form.type === "for_sale" && !form.condition.trim()) {
    errors.condition = "Item condition is required.";
  }

  const loc = form.location.trim();
  if (loc.length > LIMITS.listingLocation) {
    errors.location = `Location must be ${LIMITS.listingLocation} characters or less.`;
  }

  if (opts.photoCount > 6) {
    errors.photos = "You can add up to 6 photos.";
  }

  return errors;
}
