/** Match backend `UnitAssignmentService::normalizeUnitNumber`. */
export function normalizeUnitNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export const DUPLICATE_UNIT_MESSAGE = "This unit already exists in the community.";
