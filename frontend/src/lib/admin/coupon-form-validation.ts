import type { FieldErrors } from "@/lib/admin/form-validation-utils";

export type CouponFormLike = {
  code: string;
  name: string;
  description: string;
  discount_type: "percent" | "fixed";
  percent_off: string;
  amount_off: string;
  discount_duration: "once" | "repeating" | "forever";
  discount_months: string;
  valid_from: string;
  valid_until: string;
  max_redemptions: string;
  applicable_plan_slugs: string;
};

const CODE_RE = /^[A-Z0-9_-]{3,40}$/;

export function validateCouponForm(form: CouponFormLike): FieldErrors {
  const errors: FieldErrors = {};

  const code = form.code.trim().toUpperCase();
  if (!code) {
    errors.code = "Coupon code is required.";
  } else if (!CODE_RE.test(code)) {
    errors.code = "Use 3–40 characters: letters, numbers, underscores, or hyphens.";
  }

  const name = form.name.trim();
  if (!name) {
    errors.name = "Coupon name is required.";
  } else if (name.length < 2) {
    errors.name = "Coupon name must be at least 2 characters.";
  }

  if (form.discount_type === "percent") {
    const percent = Number.parseInt(form.percent_off, 10);
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
      errors.percent_off = "Enter a percent between 1 and 100.";
    }
  } else {
    const amount = Number.parseFloat(form.amount_off.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.amount_off = "Enter a discount amount greater than zero.";
    }
  }

  if (form.discount_duration === "repeating") {
    const months = Number.parseInt(form.discount_months, 10);
    if (!Number.isFinite(months) || months < 1 || months > 120) {
      errors.discount_months = "Enter billing cycles between 1 and 120.";
    }
  }

  if (form.valid_from && form.valid_until) {
    const from = new Date(form.valid_from).getTime();
    const until = new Date(form.valid_until).getTime();
    if (!Number.isFinite(from)) {
      errors.valid_from = "Enter a valid start date.";
    } else if (!Number.isFinite(until)) {
      errors.valid_until = "Enter a valid end date.";
    } else if (until < from) {
      errors.valid_until = "End date must be on or after the start date.";
    }
  } else if (form.valid_from && !Number.isFinite(new Date(form.valid_from).getTime())) {
    errors.valid_from = "Enter a valid start date.";
  } else if (form.valid_until && !Number.isFinite(new Date(form.valid_until).getTime())) {
    errors.valid_until = "Enter a valid end date.";
  }

  if (form.max_redemptions.trim()) {
    const max = Number.parseInt(form.max_redemptions, 10);
    if (!Number.isFinite(max) || max < 1) {
      errors.max_redemptions = "Max redemptions must be at least 1.";
    }
  }

  return errors;
}
