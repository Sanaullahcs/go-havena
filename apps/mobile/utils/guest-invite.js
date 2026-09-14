/** Normalize guest invite codes (e.g. "GST - 3QAC - 3612" → "GST-3QAC-3612"). */
export function normalizeInviteCode(code) {
  const trimmed = compactInviteInput(code);
  const compact = trimmed.replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^GST([A-Z0-9]{4})(\d{4})$/);

  if (match) {
    return `GST-${match[1]}-${match[2]}`;
  }

  return trimmed.replace(/\s+/g, "");
}

/** Resident member codes from email copy/paste (spaces, unicode dashes, missing hyphens). */
export function normalizeResidentInviteCode(code) {
  const trimmed = compactInviteInput(code);
  const compact = trimmed.replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^NBR([A-Z0-9]{4})(\d{4})$/);

  if (match) {
    return `NBR-${match[1]}-${match[2]}`;
  }

  return trimmed.replace(/\s+/g, "");
}

function compactInviteInput(code) {
  return String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2014\u2212\u00AD]/g, "-")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}
