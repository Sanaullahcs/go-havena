import { isCommunityAdmin, isResidentMode } from "../services/community-access";

let currentRole = "resident";

/** Map API user / route role to marketplace UI role. */
export function marketplaceRoleFromUser(user) {
  if (user && isResidentMode(user)) return "resident";
  if (user && isCommunityAdmin(user)) return "admin";
  return "resident";
}

export const setCurrentRole = (role) => {
  currentRole = role === "admin" || role === "community_admin" ? "admin" : "resident";
};

/** Keep in-memory role aligned with the signed-in user (call after fetchMe). */
export function syncRoleFromUser(user) {
  currentRole = marketplaceRoleFromUser(user);
  return currentRole;
}

export const getCurrentRole = () => currentRole;
