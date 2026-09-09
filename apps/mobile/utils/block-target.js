/** Block User is only for another resident — never self, admins, or system/community entities. */

const FORBIDDEN_ROLES = new Set([
  "system_admin",
  "admin",
  "community_admin",
  "moderator",
  "community",
  "system",
]);

/** `member` is the community-membership role for a normal resident. */
const RESIDENT_ROLES = new Set(["resident", "member"]);

function toUserId(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

function collectRoles(target = {}) {
  return [
    target.account_role,
    target.accountRole,
    target.author_role,
    target.authorRole,
    target.author_membership_role,
    target.role,
    target.user?.account_role,
    target.user?.author_role,
    target.user?.role,
  ]
    .filter((role) => role != null && String(role).trim() !== "")
    .map((role) => String(role).toLowerCase());
}

function isForbiddenRole(role) {
  return FORBIDDEN_ROLES.has(role);
}

function isResidentRole(role) {
  return RESIDENT_ROLES.has(role);
}

export function getBlockableUserId(target = {}, currentUserId) {
  const id = toUserId(target.userId ?? target.user_id ?? target.author_id ?? target.id ?? target.user?.id);
  if (!id) return null;

  if (currentUserId != null && String(id) === String(currentUserId)) return null;

  if (target.can_block === false && !target.isBlocked && !target.is_blocked) return null;

  const roles = collectRoles(target);
  if (roles.some(isForbiddenRole)) return null;

  if (roles.some(isResidentRole)) return id;

  // Backend already inspected account + membership roles.
  if (target.can_block === true) return id;

  return null;
}

export function canShowBlockUser(target = {}, currentUserId) {
  if (target.isBlocked || target.is_blocked) return false;
  return getBlockableUserId(target, currentUserId) != null;
}
