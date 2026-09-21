function isCommunityAdminRole(user) {
  return user?.role === "community_admin";
}

function hasApprovedAdminMembership(user) {
  return (user?.memberships ?? []).some(
    (m) => m.status === "approved" && ["admin", "moderator"].includes(m.role),
  );
}

function hasCommunityAdminCapability(user) {
  if (!user) return false;

  const flagged = user.can_switch_modes ?? user.can_use_admin_mode ?? user.can_use_resident_mode;
  if (typeof flagged === "boolean") return flagged;

  if (!isCommunityAdminRole(user)) return false;
  if ((user.community_admin_status ?? "pending") !== "approved") return false;
  return hasApprovedAdminMembership(user);
}

function isResidentMode(user) {
  const mode = user?.active_mode ?? user?.active_context;
  return Boolean(user) && mode === "resident" && hasCommunityAdminCapability(user);
}

function canSwitchModes(user) {
  return hasCommunityAdminCapability(user);
}

function canSwitchToResidentMode(user) {
  return canSwitchModes(user) && !isResidentMode(user);
}

function canSwitchToAdminMode(user) {
  return canSwitchModes(user) && isResidentMode(user);
}

function isCommunityAdmin(user) {
  if (!user || isResidentMode(user)) return false;
  if (!hasApprovedAdminMembership(user)) return false;
  if (user.role === "community_admin") {
    if (user.community_admin_status === "rejected") return false;
    if (user.community_admin_status === "pending") return false;
  }
  return true;
}

/** Same Home used after Community Admin OTP login. */
function homePathForUser() {
  return "/(tabs)/home";
}

function pickActingFlag(data, existing, key) {
  if (typeof data?.[key] === "boolean") return data[key];
  if (typeof data?.can_switch_modes === "boolean") return data.can_switch_modes;
  if (typeof data?.can_use_admin_mode === "boolean") return data.can_use_admin_mode;
  if (typeof data?.can_use_resident_mode === "boolean") return data.can_use_resident_mode;
  if (typeof existing?.[key] === "boolean") return existing[key];
  return false;
}

function mergeSessionUser(existing, data) {
  if (!data) return existing ?? null;

  return {
    ...(existing ?? {}),
    ...data,
    role: data.role ?? existing?.role ?? "resident",
    community_admin_status:
      data.community_admin_status ?? existing?.community_admin_status ?? null,
    status: data.status ?? existing?.status ?? "active",
    profile: data.profile ?? existing?.profile ?? null,
    memberships: Array.isArray(data.memberships)
      ? data.memberships
      : (existing?.memberships ?? []),
    access: data.access ?? existing?.access ?? null,
    family: data.family ?? existing?.family ?? null,
    guest_access: data.guest_access ?? existing?.guest_access ?? null,
    resident_features: data.resident_features ?? existing?.resident_features ?? null,
    active_context: data.active_context ?? data.active_mode ?? existing?.active_context ?? null,
    active_mode: data.active_mode ?? data.active_context ?? existing?.active_mode ?? null,
    active_context_community_id:
      data.active_context_community_id ?? existing?.active_context_community_id ?? null,
    can_switch_modes: pickActingFlag(data, existing, "can_switch_modes"),
    can_use_admin_mode: pickActingFlag(data, existing, "can_use_admin_mode"),
    can_use_resident_mode: pickActingFlag(data, existing, "can_use_resident_mode"),
    resident_mode_communities: Array.isArray(data.resident_mode_communities)
      ? data.resident_mode_communities
      : (existing?.resident_mode_communities ?? []),
  };
}

const actingContext = {
  isCommunityAdminRole,
  hasApprovedAdminMembership,
  hasCommunityAdminCapability,
  isResidentMode,
  canSwitchModes,
  canSwitchToResidentMode,
  canSwitchToAdminMode,
  isCommunityAdmin,
  homePathForUser,
  mergeSessionUser,
};

module.exports = actingContext;
module.exports.default = actingContext;
