/** Match backend `UnitAssignmentService::normalizeUnitNumber`. */
export function normalizeUnitNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export const DUPLICATE_UNIT_MESSAGE = "This unit already exists in the community.";

/** Matches `UnitController` admin create/update validation. */
export const ADMIN_UNIT_NUMBER_MAX = 50;

export function adminUnitNumberLengthError(value: string): string | null {
  if (value.length > ADMIN_UNIT_NUMBER_MAX) {
    return `The unit number field must not be greater than ${ADMIN_UNIT_NUMBER_MAX} characters.`;
  }
  return null;
}

export function adminUnitNumberDuplicateError(
  value: string,
  existingUnitNumbers: string[],
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeUnitNumber(trimmed);
  const duplicate = existingUnitNumbers.some((unitNumber) => normalizeUnitNumber(unitNumber) === normalized);
  return duplicate ? DUPLICATE_UNIT_MESSAGE : null;
}
