/** Canonical auth & onboarding navigation — login-first flow */

import {
  canAccessDashboard,
  hasPendingCommunityRequest,
  hasPendingMembershipApproval,
  hasRejectedCommunityRequest,
  hasRejectedMembershipApproval,
  getPrimaryMembership,
  isCommunityAdminRole,
  isCommunityAdminRejected,
  awaitsCommunityAdminApproval,
  isGuestUser,
} from "../services/community-access";
import { hasApprovedMembership, isProfileComplete } from "../services/auth-api";
import { markFirstHomeVisit } from "./user-session";
import { prepareAuthScreenChrome } from "../components/layout/chrome-manager";

export const Routes = {
  SPLASH: "/",
  LOGIN: "/screens/login",
  LOGIN_VERIFY: "/screens/login/verify-phone",
  ROLES: "/screens/roles",
  SIGNUP: "/screens/signup",
  SIGNUP_VERIFY: "/screens/verifyregistration",
  REGION: "/screens/region",
  REGION_COMMUNITIES: "/screens/region/communities",
  INVITE_CODE: "/screens/invite-code",
  REQUEST_COMMUNITY: "/screens/request-for-community",
  COMPLETE_PROFILE: "/screens/complete-profile",
  PENDING_COMMUNITY: "/screens/pending-community",
  PENDING_COMMUNITY_ADMIN: "/screens/pending-community-admin",
  COMPLETE_BILLING: "/screens/complete-billing",
  PENDING_FAMILY: "/screens/pending-family",
  TABS_HOME: "/(tabs)/home",
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

/** Resume complete-profile only when user already joined a live community mid-onboarding. */
export function needsCompleteProfile(user) {
  if (canAccessDashboard(user) || hasApprovedMembership(user)) return false;
  if (hasPendingCommunityRequest(user) || hasRejectedMembershipApproval(user)) return false;
  if (isProfileComplete(user)) return false;

  return (user?.memberships ?? []).some((m) => {
    const community = m.community;
    if (community?.review_status === "pending") return false;
    if (community?.review_status === "rejected") return false;
    return Boolean(m.community_id);
  });
}

export function getCompleteProfileParams(user, role = "resident") {
  const membership = getPrimaryMembership(user);
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

  const activeRole = user?.role || "resident";

  if (canAccessDashboard(user)) {
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

  if (canAccessDashboard(user)) {
    return { pathname: Routes.TABS_HOME, params: { role: onboardingRole } };
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
    if (nextStep === "complete_profile" || (!nextStep && !isProfileComplete(user) && getPrimaryMembership(user)?.community_id)) {
      return {
        pathname: Routes.COMPLETE_PROFILE,
        params: getCompleteProfileParams(user, "admin"),
      };
    }
    if (nextStep === "complete_billing_web") {
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
      if (!isProfileComplete(user)) {
        return {
          pathname: Routes.COMPLETE_PROFILE,
          params: getCompleteProfileParams(user, "admin"),
        };
      }
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
    if (needsCompleteProfile(user)) {
      return {
        pathname: Routes.COMPLETE_PROFILE,
        params: getCompleteProfileParams(user, onboardingRole),
      };
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

  if (needsCompleteProfile(user)) {
    return {
      pathname: Routes.COMPLETE_PROFILE,
      params: getCompleteProfileParams(user, onboardingRole),
    };
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
export function finishOnboarding(router, { role, user } = {}) {
  if (user) {
    navigateAfterAuth(router, user, { role });
    return;
  }
  markFirstHomeVisit();
  resetTo(router, Routes.TABS_HOME, { role, firstVisit: "1" });
}
