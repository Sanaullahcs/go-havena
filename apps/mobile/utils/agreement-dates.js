import { toApiDate } from "./form-datetime";

export function agreementDateFromApi(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function agreementDateErrors(due, effective, expires, t) {
  const today = toApiDate(new Date());
  const dueAt = toApiDate(due) ?? "";
  const effectiveAt = toApiDate(effective) ?? "";
  const expiresAt = toApiDate(expires) ?? "";
  const errors = {};

  if (!dueAt) errors.dueAt = t("propertyMgmt.dueDateRequired");
  else if (dueAt < today) errors.dueAt = t("propertyMgmt.dueDatePast");

  if (!effectiveAt) errors.effectiveAt = t("propertyMgmt.effectiveDateRequired");
  else if (effectiveAt < today) errors.effectiveAt = t("propertyMgmt.effectiveDatePast");

  if (!expiresAt) errors.expiresAt = t("propertyMgmt.expirationDateRequired");
  else if (expiresAt < today) errors.expiresAt = t("propertyMgmt.expirationDatePast");
  else if (effectiveAt && expiresAt < effectiveAt) errors.expiresAt = t("propertyMgmt.expirationBeforeEffective");
  else if (dueAt && expiresAt < dueAt) errors.expiresAt = t("propertyMgmt.expirationBeforeDue");

  return errors;
}
