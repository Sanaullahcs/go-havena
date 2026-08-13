import type { FieldErrors } from "@/lib/admin/form-validation-utils";

export type CommunitySetupForm = {
  regionId: string;
  name: string;
  address: string;
  regionsLoaded: boolean;
};

export function validateCommunitySetupForm(form: CommunitySetupForm): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.regionsLoaded) {
    errors.regionId = "Regions are still loading. Please wait.";
  } else if (!form.regionId.trim()) {
    errors.regionId = "Select a region.";
  }

  const name = form.name.trim();
  if (!name) {
    errors.name = "Community name is required.";
  } else if (name.length < 2) {
    errors.name = "Community name must be at least 2 characters.";
  } else if (name.length > 150) {
    errors.name = "Community name must be 150 characters or less.";
  }

  const address = form.address.trim();
  if (!address) {
    errors.address = "Address is required.";
  } else if (address.length < 5) {
    errors.address = "Enter a full street address (at least 5 characters).";
  } else if (address.length > 255) {
    errors.address = "Address must be 255 characters or less.";
  }

  return errors;
}
