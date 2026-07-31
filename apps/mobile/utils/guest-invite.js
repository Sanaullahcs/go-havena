/** Normalize guest invite codes (e.g. "GST - 3QAC - 3612" → "GST-3QAC-3612"). */
export function normalizeInviteCode(code) {
  const trimmed = String(code ?? "").trim().toUpperCase();
  const compact = trimmed.replace(/[\s-]+/g, "");
  const match = compact.match(/^GST([A-Z0-9]{4})(\d{4})$/);

  if (match) {
    return `GST-${match[1]}-${match[2]}`;
  }

  return trimmed;
}
