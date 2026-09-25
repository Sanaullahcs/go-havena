export const COMMUNITY_ADMIN_NAME_MAX = 50;
export const COMMUNITY_ADMIN_UNIT_MAX = 20;

export const COMMUNITY_ADMIN_NAME_MAX_MESSAGE = "Full name cannot exceed 50 characters.";
export const COMMUNITY_ADMIN_UNIT_MAX_MESSAGE = "Unit / apartment cannot exceed 20 characters.";

/**
 * Cap new input and paste at the limit.
 * Values already over the limit stay visible so the user can delete down to it.
 */
export function applyCharacterLimit(current: string, next: string, max: number): string {
  if (next.length <= max) return next;
  if (next.length < current.length) return next;
  if (current.length >= max) return current;
  return next.slice(0, max);
}

export function exceedsCharacterLimit(value: string, max: number): boolean {
  return value.length > max || value.trim().length > max;
}
