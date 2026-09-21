/**
 * Community Admin ↔ Resident Mode: capability is separate from active UI mode.
 */
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const {
  canSwitchModes,
  canSwitchToAdminMode,
  canSwitchToResidentMode,
  hasCommunityAdminCapability,
  isCommunityAdmin,
  isResidentMode,
  homePathForUser,
  mergeSessionUser,
} = require(join(import.meta.dirname, "../services/acting-context.cjs"));

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const adminMemberships = [
  { community_id: 7, role: "admin", status: "approved" },
];

const communityAdmin = {
  id: 11,
  role: "community_admin",
  community_admin_status: "approved",
  active_mode: "community_admin",
  active_context: "community_admin",
  active_context_community_id: 7,
  can_switch_modes: true,
  can_use_admin_mode: true,
  can_use_resident_mode: true,
  memberships: adminMemberships,
};

const residentMode = {
  ...communityAdmin,
  active_mode: "resident",
  active_context: "resident",
};

const strippedResidentMode = {
  id: 11,
  role: "community_admin",
  community_admin_status: "approved",
  memberships: adminMemberships,
};

const normalResident = {
  id: 22,
  role: "resident",
  active_mode: "resident",
  active_context: "resident",
  can_switch_modes: false,
  can_use_admin_mode: false,
  can_use_resident_mode: false,
  memberships: [{ community_id: 7, role: "member", status: "approved" }],
};

assert(hasCommunityAdminCapability(communityAdmin), "approved CA has capability in admin mode");
assert(hasCommunityAdminCapability(residentMode), "approved CA keeps capability in resident mode");
assert(hasCommunityAdminCapability(strippedResidentMode), "capability falls back to role + membership");
assert(!hasCommunityAdminCapability(normalResident), "plain resident has no admin capability");

assert(canSwitchModes(residentMode), "switch-back is allowed from resident mode");
assert(canSwitchToAdminMode(residentMode), "resident-mode CA can return to admin");
assert(canSwitchToResidentMode(communityAdmin), "admin-mode CA can enter resident mode");
assert(!canSwitchToAdminMode(communityAdmin), "admin-mode CA is not offered return-to-admin");
assert(!canSwitchModes(normalResident), "plain resident cannot switch modes");
assert(!canSwitchToAdminMode(normalResident), "plain resident cannot enter admin mode");

assert(isResidentMode(residentMode), "CA in resident mode is detected from capability + mode");
assert(!isResidentMode(communityAdmin), "admin mode is not resident mode");
assert(!isResidentMode(normalResident), "plain resident is not Resident Mode");
assert(!isCommunityAdmin(residentMode), "resident mode must not receive admin UI");
assert(isCommunityAdmin(communityAdmin), "admin mode receives admin UI");
assert(homePathForUser(residentMode) === "/(tabs)/home", "resident mode Home is Resident Home");
assert(homePathForUser(communityAdmin) === "/(tabs)/home", "admin mode Home matches OTP Community Admin Home");
assert(homePathForUser(normalResident) === "/(tabs)/home", "plain resident Home is Resident Home");

const merged = mergeSessionUser(
  communityAdmin,
  {
    id: 11,
    role: "community_admin",
    community_admin_status: "approved",
    active_mode: "resident",
    active_context: "resident",
    active_context_community_id: 7,
    can_switch_modes: true,
    can_use_admin_mode: true,
    can_use_resident_mode: true,
    memberships: adminMemberships,
  },
);

assert(merged.role === "community_admin", "sync must keep the account role");
assert(merged.active_mode === "resident", "sync must persist the active mode");
assert(merged.can_switch_modes === true, "sync must persist switch capability");
assert(canSwitchModes(merged) && isResidentMode(merged), "merged resident-mode user can switch back");
assert(!isCommunityAdmin(merged), "merged resident-mode user is not in admin UI");

const mergedResident = mergeSessionUser(normalResident, {
  id: 22,
  role: "resident",
  can_switch_modes: false,
  memberships: normalResident.memberships,
});
assert(!canSwitchModes(mergedResident), "merged plain resident still cannot switch");

console.log("resident-mode-switch: capability, persistence, and resident lockout — ok");
