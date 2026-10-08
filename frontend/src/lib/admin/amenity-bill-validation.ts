import type { FieldErrors } from "@/lib/admin/form-validation-utils";
import type {
  AmenityMonthlyBillForm,
  AmenityPaymentProofForm,
  AmenityPaymentRejectionCode,
} from "@/lib/api/amenities";
import { formatCommunityMoney } from "@/lib/money";

export const PAYMENT_REJECTION_REASONS: Array<{ code: AmenityPaymentRejectionCode; label: string }> = [
  { code: "unclear_proof", label: "Payment proof is unclear" },
  { code: "amount_mismatch", label: "Amount does not match" },
  { code: "incorrect_bill", label: "Incorrect bill/payment" },
  { code: "invalid_receipt", label: "Invalid receipt" },
  { code: "other", label: "Other" },
];

export const BILL_FILE_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

const ALLOWED_FILE_RE = /\.(pdf|doc|docx|jpe?g|png|webp)$/i;

export function currentBillingMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatBillingMonthLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function defaultBillTitle(amenityName: string, billingMonth: string): string {
  const label = formatBillingMonthLabel(billingMonth);
  return label ? `${amenityName} — ${label}` : amenityName;
}

export function defaultDueDate(billingMonth: string, dueDay: number | null | undefined): string {
  if (!/^\d{4}-\d{2}$/.test(billingMonth) || !dueDay) return "";
  const [year, month] = billingMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Math.max(dueDay, 1), lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatBillDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatBillAmount(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return formatCommunityMoney(value);
}

export function validateAmenityBillForm(form: AmenityMonthlyBillForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.billing_month) errors.billing_month = "Billing month is required.";
  if (!form.title.trim()) errors.title = "Bill title is required.";
  else if (form.title.trim().length > 200) errors.title = "Bill title must be 200 characters or less.";

  const amount = Number(form.amount_per_resident);
  if (!form.amount_per_resident.trim()) errors.amount_per_resident = "Amount per resident is required.";
  else if (!Number.isFinite(amount) || amount < 0.01) errors.amount_per_resident = "Enter an amount greater than 0.";

  if (!form.due_date) errors.due_date = "Due date is required.";
  if (!form.file) errors.file = "Upload the original bill screenshot or document.";
  else if (!ALLOWED_FILE_RE.test(form.file.name)) {
    errors.file = "Use a PDF, Word, JPG, PNG, or WebP file.";
  }

  return errors;
}

export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function validatePaymentProofForm(form: AmenityPaymentProofForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.file) errors.file = "Upload a payment screenshot or receipt.";
  else if (!ALLOWED_FILE_RE.test(form.file.name)) {
    errors.file = "Use a PDF, Word, JPG, PNG, or WebP file.";
  }

  if (!form.payment_date) errors.payment_date = "Payment date is required.";
  else if (form.payment_date > todayIsoDate()) {
    errors.payment_date = "Payment date cannot be in the future.";
  }

  if (form.payment_reference.trim().length > 100) {
    errors.payment_reference = "Reference number must be 100 characters or less.";
  }
  if (form.payment_note.trim().length > 1000) {
    errors.payment_note = "Note must be 1000 characters or less.";
  }

  return errors;
}

export function billStatusTone(status?: string | null): "amber" | "blue" | "green" | "red" | "slate" {
  if (status === "pending_verification") return "blue";
  if (status === "paid") return "green";
  if (status === "unpaid") return "amber";
  if (status === "rejected" || status === "overdue") return "red";
  return "slate";
}

export function validatePaymentRejection(form: {
  rejection_code: AmenityPaymentRejectionCode | "";
  rejection_reason: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.rejection_code) errors.rejection_code = "Select a rejection reason.";
  if (form.rejection_code === "other" && !form.rejection_reason.trim()) {
    errors.rejection_reason = "Enter a rejection reason.";
  } else if (form.rejection_reason.trim().length > 500) {
    errors.rejection_reason = "Reason must be 500 characters or less.";
  }
  return errors;
}
