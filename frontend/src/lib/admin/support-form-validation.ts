import type { FieldErrors } from "@/lib/admin/form-validation-utils";

export function validateSupportForm(form: { subject: string; message: string }): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.subject.trim()) {
    errors.subject = "Subject is required.";
  }

  if (!form.message.trim()) {
    errors.message = "Message is required.";
  }

  return errors;
}
