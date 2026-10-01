/** @see frontend/src/lib/admin/notice-text-validation.ts */
export const NOTICE_PLAIN_TEXT_PATTERN = /^[\p{L}\p{N}\s.,'\-&()#/:]+$/u;

export function noticePlainTextError(value, label, { required = false, i18n } = {}) {
  const t = i18n?.t?.bind(i18n) ?? ((key, opts) => opts?.defaultValue ?? key);
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return required
      ? t("validation.required", { field: label })
      : undefined;
  }
  if (!NOTICE_PLAIN_TEXT_PATTERN.test(trimmed)) {
    return t("validation.eventPlainText", { field: label });
  }
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    return t("validation.eventPlainTextAlphanumeric", { field: label });
  }
  return undefined;
}
