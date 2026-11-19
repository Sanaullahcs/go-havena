/** Canonical auth & onboarding navigation — login-first flow */

import {
  canAccessDashboard,
  currentCommunityId,
  hasPendingCommunityRequest,
  hasPendingMembershipApproval,
  hasRejectedCommunityRequest,
  hasRejectedMembershipApproval,
  getPendingInvitedMembership,
  getPrimaryMembership,
  approvedResidentMemberships,
  hasLinkedCommunityForProfile,
  isCommunityAdminRole,
  isCommunityAdminRejected,
  awaitsCommunityAdminApproval,
  isGuestUser,
  needsInviteCode,
} from "../services/community-access";
import { hasApprovedMembership, isProfileComplete } from "../services/auth-api";
import { markFirstHomeVisit } from "./user-session";
import { hasSeenProductWelcome, markProductWelcomeSeen } from "../services/product-welcome-seen";
import { prepareAuthScreenChrome } from "../components/layout/chrome-manager";

export const STAFF_HOME = "/screens/staff-tasks/home";
export const STAFF_INVITES = "/screens/staff-tasks/invitations";

/** Activated staff with no resident or community-admin access. */
export function isStaffOnlyUser(user) {
  return Boolean(user?.staff_access?.active) && !canAccessDashboard(user) && !isCommunityAdminRole(user);
}

/** Approved resident who is also active staff in the community they currently have selected. */
export function isResidentWithStaff(user) {
  if (!user?.staff_access?.active || !canAccessDashboard(user) || isGuestUser(user)) return false;
  const communityId = currentCommunityId(user);
  if (!communityId) return false;
  return (user.staff_access.communities ?? []).some((community) => Number(community.id) === Number(communityId));
}

/** A staff invitation is waiting, and this account has no resident home yet. */
export function hasPendingStaffInvite(user) {
  return Boolean(user?.staff_access?.pending) && !user?.staff_access?.active && !canAccessDashboard(user) && !isCommunityAdminRole(user);
}

export const Routes = {
  SPLASH: "/",
  LOGIN: "/screens/login",
  LOGIN_VERIFY: "/screens/login/verify-phone",
  ROLES: "/screens/roles",
  SIGNUP: "/screens/signup",
  SIGNUP_VERIFY: "/screens/verifyregistration",
  REGION: "/screens/region",
  REGION_COMMUNITIES: "/screens/region/communities",
  JOIN_COMMUNITY_UNITS: "/screens/join-community-units",
  MY_COMMUNITY: "/screens/my-community",
  INVITE_CODE: "/screens/invite-code",
  REQUEST_COMMUNITY: "/screens/request-for-community",
  COMPLETE_PROFILE: "/screens/complete-profile",
  PENDING_COMMUNITY: "/screens/pending-community",
  PENDING_COMMUNITY_ADMIN: "/screens/pending-community-admin",
  COMPLETE_BILLING: "/screens/complete-billing",
  PENDING_FAMILY: "/screens/pending-family",
  MY_FAMILY: "/screens/my-family",
  TABS_HOME: "/(tabs)/home",
  ADMIN_DASHBOARD: "/screens/admin-dashboard",
  COMMUNITY_WELCOME: "/screens/community-welcome",
  CHOOSE_LOGIN_COMMUNITY: "/screens/choose-login-community",
};

function resetTo(router, pathname, params = {}) {
  if (pathname === Routes.LOGIN) {
    prepareAuthScreenChrome();
  }
  try {
    if (router.canDismiss?.()) {
      router.dismissAll();
    }
  } catch {
    // cold start — nothing to dismiss
  }
  router.replace({ pathname, params });
}

/** Same landing as Community Admin OTP login — do not add a separate mode route. */
export function resetToActiveModeHome(router, user) {
  navigateAfterAuth(router, user, { mode: "login" });
}

/** Resume complete-profile before any approval/waiting screen once a community is linked. */
export function needsCompleteProfile(user) {
  if (!user || isProfileComplete(user)) return false;
  if (needsInviteCode(user)) return false;
  return hasLinkedCommunityForProfile(user);
}

export function getCompleteProfileParams(user, role = "resident") {
  const membership = getPendingInvitedMembership(user) || getPrimaryMembership(user);
  const community = membership?.community;

  return {
    role,
    ...(user?.profile?.region_id
      ? { regionId: String(user.profile.region_id) }
      : {}),
    ...(membership?.community_id
      ? { communityId: String(membership.community_id) }
      : {}),
    communityName: community?.name || community?.title || "Your Community",
    ...(community?.review_status === "pending" ? { communityRequest: "1" } : {}),
    ...(membership?.invite_code_used ? { invited: "1" } : {}),
  };
}

/** Resolve cold-start route after splash — home, approval wait, or resume onboarding. */
export function getColdStartRoute(user) {
  if (!user) {
    return { pathname: Routes.LOGIN, params: {} };
  }

  if (isStaffOnlyUser(user)) {
    return { pathname: STAFF_HOME, params: {} };
  }

  if (hasPendingStaffInvite(user)) {
    return { pathname: STAFF_INVITES, params: {} };
  }

  const activeRole = user?.role || "resident";

  if (needsInviteCode(user)) {
    return {
      pathname: Routes.INVITE_CODE,
      params: { role: isCommunityAdminRole(user) ? "admin" : activeRole },
    };
  }

  if (user?.pending_unit_package) {
    return {
      pathname: Routes.PENDING_COMMUNITY,
      params: { role: activeRole, unitPackage: "1" },
    };
  }

  if (canAccessDashboard(user) && isProfileComplete(user)) {
    return { pathname: Routes.TABS_HOME, params: { role: activeRole } };
  }

  return getPostAuthRoute(user);
}

/** Splash / app launch — never resume mid-onboarding screens (complete-profile, region, etc.). */
export function navigateFromColdStart(router, user) {
  if (!user) {
    resetTo(router, Routes.LOGIN);
    return;
  }

  const route = getColdStartRoute(user);

  if (route.pathname === Routes.TABS_HOME) {
    markFirstHomeVisit();
  }

  resetTo(router, route.pathname, route.params);
}

/** Resolve where an authenticated user should land (pathname + params). */
export function getPostAuthRoute(user, { role, mode } = {}) {
  const signupRole = role === "admin" ? "admin" : role;
  const activeRole = signupRole || user?.role || "resident";
  const onboardingRole = isCommunityAdminRole(user) ? "admin" : activeRole;

  if (isCommunityAdminRejected(user)) {
    return { pathname: Routes.LOGIN, params: {} };
  }

  if (isGuestUser(user)) {
    if (canAccessDashboard(user)) {
      return { pathname: Routes.TABS_HOME, params: {} };
    }
    return { pathname: Routes.PENDING_COMMUNITY, params: { guest: "1" } };
  }

  if (isStaffOnlyUser(user)) {
    return { pathname: STAFF_HOME, params: {} };
  }

  if (hasPendingStaffInvite(user)) {
    return { pathname: STAFF_INVITES, params: {} };
  }

  if (needsInviteCode(user)) {
    return {
      pathname: Routes.INVITE_CODE,
      params: {
        role: onboardingRole,
        ...(user?.phone ? { phone: user.phone } : {}),
      },
    };
  }

  if (needsCompleteProfile(user)) {
    return {
      pathname: Routes.COMPLETE_PROFILE,
      params: getCompleteProfileParams(user, onboardingRole),
    };
  }

  if (user?.pending_unit_package) {
    return {
      pathname: Routes.PENDING_COMMUNITY,
      params: { role: onboardingRole, unitPackage: "1" },
    };
  }

  if (canAccessDashboard(user)) {
    return { pathname: Routes.TABS_HOME, params: { role: onboardingRole } };
  }

  if (isStaffOnlyUser(user)) {
    return { pathname: STAFF_HOME, params: {} };
  }

  // Community admin access gate from backend `/me` access payload.
  if (isCommunityAdminRole(user) || signupRole === "admin") {
    const nextStep = user?.access?.next_step;
    if (nextStep === "link_community") {
      if (user?.profile?.region_id) {
        return {
          pathname: Routes.REGION_COMMUNITIES,
          params: {
            regionId: String(user.profile.region_id),
            role: "admin",
            ...(user?.phone ? { phone: user.phone } : {}),
          },
        };
      }
      return {
        pathname: Routes.REGION,
        params: {
          role: "admin",
          ...(user?.phone ? { phone: user.phone } : {}),
        },
      };
    }
    if (nextStep === "complete_billing_web" || nextStep === "configure_resident_features") {
      return { pathname: Routes.COMPLETE_BILLING, params: { role: "admin" } };
    }
    if (nextStep === "await_approval") {
      return { pathname: Routes.COMPLETE_BILLING, params: { role: "admin" } };
    }
    if (nextStep === "rejected") {
      return { pathname: Routes.PENDING_COMMUNITY_ADMIN, params: { role: "admin", rejected: "1" } };
    }
    if (nextStep === "ready") {
      return { pathname: Routes.TABS_HOME, params: { role: "admin" } };
    }
    if (getPrimaryMembership(user)?.community_id) {
      return { pathname: Routes.COMPLETE_BILLING, params: { role: "admin" } };
    }
  }

  const familyState = user?.family?.state;
  if (familyState === "pending" || familyState === "rejected") {
    return { pathname: Routes.PENDING_FAMILY, params: { role: onboardingRole } };
  }

  // Returning login — surface pending/rejected states; resume onboarding instead of login loop.
  if (mode === "login") {
    if (hasPendingCommunityRequest(user)) {
      return { pathname: Routes.PENDING_COMMUNITY, params: { role: onboardingRole } };
    }
    if (hasPendingMembershipApproval(user)) {
      return { pathname: Routes.PENDING_COMMUNITY, params: { role: onboardingRole } };
    }
    if (hasRejectedMembershipApproval(user) || hasRejectedCommunityRequest(user)) {
      return { pathname: Routes.PENDING_COMMUNITY, params: { role: onboardingRole } };
    }
    if (awaitsCommunityAdminApproval(user)) {
      return { pathname: Routes.PENDING_COMMUNITY_ADMIN, params: { role: onboardingRole } };
    }
    if (user?.profile?.region_id) {
      return {
        pathname: Routes.REGION_COMMUNITIES,
        params: {
          regionId: String(user.profile.region_id),
          role: onboardingRole,
          ...(user?.phone ? { phone: user.phone } : {}),
        },
      };
    }
    // Fall through to region / admin onboarding below — never bounce back to login.
  }

  if (hasPendingCommunityRequest(user)) {
    return { pathname: Routes.PENDING_COMMUNITY, params: { role: onboardingRole } };
  }

  if (hasPendingMembershipApproval(user)) {
    return { pathname: Routes.PENDING_COMMUNITY, params: { role: onboardingRole } };
  }

  if (hasRejectedMembershipApproval(user)) {
    return { pathname: Routes.PENDING_COMMUNITY, params: { role: onboardingRole } };
  }

  if (hasRejectedCommunityRequest(user)) {
    return {
      pathname: Routes.REQUEST_COMMUNITY,
      params: { role: onboardingRole, rejected: "1" },
    };
  }

  if (awaitsCommunityAdminApproval(user)) {
    return { pathname: Routes.PENDING_COMMUNITY_ADMIN, params: { role: onboardingRole } };
  }

  // Community admin: pick region, then select or register a community before approval.
  if (isCommunityAdminRole(user) || signupRole === "admin") {
    return {
      pathname: Routes.REGION,
      params: {
        role: "admin",
        ...(user?.phone ? { phone: user.phone } : {}),
      },
    };
  }

  return {
    pathname: Routes.REGION,
    params: { role: activeRole, ...(user?.phone ? { phone: user.phone } : {}) },
  };
}

/**
 * Product welcome is only for a resident or community admin whose first
 * successful login lands on Home, and only until they finish or skip it.
 */
export async function shouldShowCommunityWelcome(user) {
  if (!user || isGuestUser(user)) return false;
  if (getPostAuthRoute(user, { mode: "login" }).pathname !== Routes.TABS_HOME) return false;
  return !(await hasSeenProductWelcome(user));
}

export function openCommunityWelcome(router) {
  router.replace(Routes.COMMUNITY_WELCOME);
}

/** Approved communities a resident can enter after email OTP. */
export function enrolledLoginCommunities(user) {
  if (!user || isGuestUser(user) || isCommunityAdminRole(user)) return [];
  if (needsInviteCode(user) || needsCompleteProfile(user) || !canAccessDashboard(user)) return [];
  return approvedResidentMemberships(user);
}

export function shouldChooseCommunityOnLogin(user) {
  return enrolledLoginCommunities(user).length > 1;
}

/** After email OTP: pick a community when the resident belongs to more than one. */
export function continueAfterEmailLogin(router, user) {
  if (shouldChooseCommunityOnLogin(user)) {
    resetTo(router, Routes.CHOOSE_LOGIN_COMMUNITY);
    return;
  }
  void openHomeAfterLogin(router, user);
}

/** After login: show the one-time welcome, otherwise go straight home. */
export async function openHomeAfterLogin(router, user) {
  if (await shouldShowCommunityWelcome(user)) {
    openCommunityWelcome(router);
    return;
  }
  navigateAfterAuth(router, user, { mode: "login" });
}

/** Leave the overview without popping back to the login stack. */
export async function continueFromCommunityWelcome(router, user) {
  await markProductWelcomeSeen(user);
  navigateAfterAuth(router, user, { mode: "login" });
}

/** Single entry for post-login, post-signup, splash, and biometric auth. */
export function navigateAfterAuth(router, user, { role, mode } = {}) {
  if (!user) {
    resetTo(router, Routes.LOGIN);
    return;
  }

  const route = getPostAuthRoute(user, { role, mode });

  if (route.pathname === Routes.TABS_HOME) {
    markFirstHomeVisit();
  }

  resetTo(router, route.pathname, route.params);
}

/** @deprecated Use navigateAfterAuth */
export function resolveAuthenticatedRoute(user) {
  return getPostAuthRoute(user).pathname;
}

/** Returning user — after OTP or biometric sign-in */
export function goToApp(router, userOrParams = {}) {
  if (userOrParams?.memberships || userOrParams?.profile || userOrParams?.id) {
    navigateAfterAuth(router, userOrParams);
    return;
  }
  resetTo(router, Routes.TABS_HOME, userOrParams);
}

/** New user — after signup OTP (alias for clarity in signup screens) */
export function goToOnboarding(router, user, { role } = {}) {
  navigateAfterAuth(router, user, { role });
}

export function goToRegion(router, { role, phone } = {}) {
  resetTo(router, Routes.REGION, { role, phone });
}

export function goToRegionCommunities(router, { regionId, regionTitle, regionArea, regionState, role } = {}) {
  router.push({
    pathname: Routes.REGION_COMMUNITIES,
    params: {
      regionId: regionId != null ? String(regionId) : undefined,
      regionTitle,
      regionArea,
      regionState,
      role,
    },
  });
}

export function goToInviteCode(router, { role, regionId, phone } = {}) {
  router.push({
    pathname: Routes.INVITE_CODE,
    params: {
      role,
      regionId: regionId != null ? String(regionId) : undefined,
      phone,
    },
  });
}

export function goToCompleteProfile(router, params = {}) {
  router.push({ pathname: Routes.COMPLETE_PROFILE, params });
}

export function goToJoinCommunityUnits(router, { communityId, communityName, regionId, returnTo, switchAfter } = {}) {
  router.push({
    pathname: Routes.JOIN_COMMUNITY_UNITS,
    params: {
      communityId: communityId != null ? String(communityId) : undefined,
      communityName: communityName ? String(communityName) : undefined,
      regionId: regionId != null ? String(regionId) : undefined,
      ...(switchAfter ? { switchAfter: "1" } : { joinAnother: "1" }),
      ...(returnTo ? { returnTo: String(returnTo) } : {}),
    },
  });
}

/** After a resident adds another community, land on Home for their existing approved community. */
export function finishJoinAnotherCommunity(router) {
  try {
    if (router.canDismiss?.()) {
      router.dismissAll();
    }
  } catch {
    // cold start — nothing to dismiss
  }
  router.replace({ pathname: Routes.TABS_HOME, params: { role: "resident" } });
}

export function goToMyCommunity(router) {
  resetTo(router, Routes.MY_COMMUNITY);
}

export function goToPendingCommunity(router, params = {}) {
  resetTo(router, Routes.PENDING_COMMUNITY, params);
}

export function goToPendingFamily(router, params = {}) {
  resetTo(router, Routes.PENDING_FAMILY, params);
}

export function goToLogin(router) {
  resetTo(router, Routes.LOGIN);
}

/** Onboarding step finished (profile saved, invite joined, etc.) */
export function finishOnboarding(router, { role, user, returnTo } = {}) {
  if (returnTo === "my-community") {
    goToMyCommunity(router);
    return;
  }
  if (user) {
    navigateAfterAuth(router, user, { role });
    return;
  }
  markFirstHomeVisit();
  resetTo(router, Routes.TABS_HOME, { role, firstVisit: "1" });
}
