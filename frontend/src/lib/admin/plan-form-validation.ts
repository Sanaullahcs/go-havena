import type { FieldErrors } from "@/lib/admin/form-validation-utils";

export type PlanFormLike = {
  name: string;
  description: string;
  seat_limit: string;
  price_monthly: string;
  price_yearly: string;
  trial_period_days: string;
};

export function dollarsToCents(value: string): number | null {
  const n = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToDollarInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/** Catalog default: yearly = 10 × monthly (two months free vs paying monthly). */
export function yearlyFromMonthly(monthly: string): string {
  const cents = dollarsToCents(monthly);
  if (cents === null) return "";
  return centsToDollarInput(cents * 10);
}

export function validatePlanForm(form: PlanFormLike): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.name.trim()) {
    errors.name = "Plan name is required.";
  } else if (form.name.trim().length < 2) {
    errors.name = "Plan name must be at least 2 characters.";
  }

  const seats = Number.parseInt(form.seat_limit, 10);
  if (!Number.isFinite(seats) || seats < 1) {
    errors.seat_limit = "Enter a resident limit of at least 1.";
  }

  if (dollarsToCents(form.price_monthly) === null) {
    errors.price_monthly = "Enter a valid monthly price.";
  }

  if (dollarsToCents(form.price_yearly) === null) {
    errors.price_yearly = "Enter a valid yearly price.";
  }

  const trial = Number.parseInt(form.trial_period_days, 10);
  if (!Number.isFinite(trial) || trial < 0 || trial > 365) {
    errors.trial_period_days = "Trial must be between 0 and 365 days.";
  }

  return errors;
}
