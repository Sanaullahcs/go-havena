/**
 * Determines whether a resident can access the main app (tabs/dashboard).
 */

import actingContext from "./acting-context.cjs";

function membershipRecency(membership) {
  const stamp = Date.parse(membership?.updated_at || membership?.created_at || "");
  if (Number.isFinite(stamp)) return stamp;
  return Number(membership?.id) || 0;
}

export function getPrimaryMembership(user) {
  const memberships = user?.memberships ?? [];
  if (!memberships.length) return null;

  const activeId = user?.active_context_community_id;
  if (activeId) {
    const active = memberships.find((m) => String(m.community_id) === String(activeId));
    if (active?.status === "approved") return active;
  }

  const newest = (status) =>
    memberships
      .filter((m) => m.status === status)
      .sort((a, b) => membershipRecency(b) - membershipRecency(a))[0] ?? null;

  return newest("approved") || newest("pending") || newest("rejected") || memberships[0];
}

/** Newest pending membership created from an admin invite code. */
export function getPendingInvitedMembership(user) {
  const memberships = user?.memberships ?? [];
  return (
    memberships
      .filter(
        (membership) =>
          membership?.status === "pending" &&
          String(membership?.invite_code_used ?? "").trim() !== "",
      )
      .sort((a, b) => membershipRecency(b) - membershipRecency(a))[0] ?? null
  );
}

export function approvedResidentMemberships(user) {
  return (user?.memberships ?? []).filter((m) => {
    if (m.status !== "approved") return false;
    const community = m.community;
    if (!community) return true;
    if (community.review_status === "pending" || community.review_status === "rejected") return false;
    if (community.status && community.status !== "active") return false;
    return true;
  });
}

export function canSwitchCommunities(user) {
  if (user?.can_switch_communities === true) return true;
  return approvedResidentMemberships(user).length > 1;
}

export function membershipForCommunity(user, communityId) {
  if (!communityId) return null;
  return (user?.memberships ?? []).find((m) => String(m.community_id) === String(communityId)) ?? null;
}

function isAwaitingCommunityReview(membership) {
  const community = membership?.community;
  if (!community || community.review_status !== "pending") return false;
  if (membership.status === "rejected") return false;
  return true;
}

export function hasPendingCommunityRequest(user) {
  if (approvedResidentMemberships(user).length > 0) return false;
  return (user?.memberships ?? []).some(isAwaitingCommunityReview);
}

/** Resident selected an existing community — waiting for community admin to approve membership. */
export function hasPendingMembershipApproval(user) {
  if (isCommunityAdminRole(user)) return false;
  if (approvedResidentMemberships(user).length > 0) return false;

  return (user?.memberships ?? []).some((m) => {
    if (m.status !== "pending") return false;
    const community = m.community;
    if (!community) return true;
    if (community.review_status === "pending") return false;
    if (community.review_status === "rejected") return false;
    return true;
  });
}

export function hasAnyPendingApproval(user) {
  return hasPendingCommunityRequest(user) || hasPendingMembershipApproval(user);
}

export function hasRejectedCommunityRequest(user) {
  if (hasPendingCommunityRequest(user)) return false;
  return (user?.memberships ?? []).some(
    (m) => m.community?.review_status === "rejected",
  );
}

/** Resident's join request to an existing community was declined. */
export function hasRejectedMembershipApproval(user) {
  if (isCommunityAdminRole(user)) return false;
  if (approvedResidentMemberships(user).length > 0) return false;
  if (hasPendingCommunityRequest(user) || hasPendingMembershipApproval(user)) return false;

  return (user?.memberships ?? []).some((m) => {
    if (m.status !== "rejected") return false;
    const community = m.community;
    if (!community) return false;
    if (community.review_status === "rejected") return false;
    return true;
  });
}

export function isGuestUser(user) {
  if (user?.role === "guest") return true;
  return (user?.memberships ?? []).some(
    (m) => m.role === "guest" && m.status === "approved",
  );
}

/** Invited resident must redeem invite code before dashboard / complete-profile resume. */
export function needsInviteCode(user) {
  return Boolean(user?.needs_invite_code);
}

export function isGuestPendingApproval(user) {
  if (!isGuestUser(user)) return false;
  return user?.guest_access?.status === "pending_approval";
}

export function canAccessDashboard(user) {
  if (isGuestUser(user)) {
    if (user?.guest_access && typeof user.guest_access.can_access_dashboard === "boolean") {
      return user.guest_access.can_access_dashboard;
    }

    return (user?.memberships ?? []).some(
      (m) => m.status === "approved" && m.role === "guest",
    );
  }

  if (isCommunityAdminRole(user)) {
    // Backend access flags are authoritative (billing + platform approval).
    if (typeof user?.access?.can_use_mobile_app === "boolean") {
      return user.access.can_use_mobile_app;
    }
    if (typeof user?.access?.can_use_dashboard === "boolean") {
      return user.access.can_use_dashboard;
    }

    // Legacy session without `access` (API offline / old cache): keep prior membership rules.
    if (user.community_admin_status !== "approved") {
      return false;
    }

    return (user?.memberships ?? []).some((m) => {
      if (m.status !== "approved" || m.role !== "admin") return false;
      const community = m.community;
      if (!community) return false;
      if (community.review_status === "pending" || community.review_status === "rejected") {
        return false;
      }
      if (community.status && community.status !== "active") {
        return false;
      }
      return true;
    });
  }

  return (user?.memberships ?? []).some((m) => {
    if (m.status !== "approved") return false;

    const community = m.community;
    if (!community) return true;

    if (community.review_status === "pending" || community.review_status === "rejected") {
      return false;
    }

    if (community.status && community.status !== "active") {
      return false;
    }

    return true;
  });
}

export function getPendingCommunity(user) {
  const membership = (user?.memberships ?? []).find(isAwaitingCommunityReview);
  return membership?.community ?? null;
}

/** Community the user is waiting on (new community request or membership approval). */
export function getPendingApprovalDetails(user) {
  const communityRequest = getPendingCommunity(user);
  if (communityRequest) {
    return { community: communityRequest, kind: "community_request" };
  }

  const membership = (user?.memberships ?? []).find((m) => {
    if (m.status !== "pending") return false;
    const community = m.community;
    if (!community) return true;
    if (community.review_status === "pending") return false;
    if (community.review_status === "rejected") return false;
    return true;
  });

  if (membership?.community) {
    return { community: membership.community, kind: "membership_approval" };
  }

  return null;
}

function fallbackCommunity(membership) {
  if (membership?.community) return membership.community;
  if (membership?.community_id) {
    return { id: membership.community_id, name: "Your community" };
  }
  return null;
}

/** Authoritative onboarding review state derived from memberships or API review payload. */
export function resolveOnboardingReviewState(user, reviewSnapshot = null) {
  if (reviewSnapshot?.status && reviewSnapshot.status !== "unknown") {
    return {
      reviewState: reviewSnapshot.status,
      kind: reviewSnapshot.kind ?? "membership_approval",
      community: reviewSnapshot.community ?? null,
      rejection_reason: reviewSnapshot.rejection_reason ?? null,
      rejected_by: reviewSnapshot.rejected_by ?? null,
    };
  }

  const memberships = user?.memberships ?? [];
  const approved = approvedResidentMemberships(user);
  if (approved.length > 0) {
    const primary = getPrimaryMembership(user);
    const membership =
      approved.find((row) => String(row.community_id) === String(primary?.community_id)) ??
      approved[0];

    return {
      reviewState: "approved",
      kind: "membership_approval",
      community: membership.community ?? fallbackCommunity(membership),
    };
  }

  for (const membership of memberships) {
    const community = membership.community;
    if (community?.review_status === "rejected") {
      return {
        reviewState: "rejected",
        kind: "community_request",
        community,
        rejection_reason: community.rejection_reason ?? membership.rejection_reason ?? null,
        rejected_by: "system_admin",
      };
    }
  }

  for (const membership of memberships) {
    if (membership.status !== "rejected") continue;

    const community = fallbackCommunity(membership);
    if (community?.review_status === "rejected") continue;

    return {
      reviewState: "rejected",
      kind: "membership_approval",
      community,
      rejection_reason: membership.rejection_reason ?? null,
      rejected_by: membership.rejected_by ?? "community_admin",
    };
  }

  for (const membership of memberships) {
    const community = membership.community;
    if (membership.status === "pending" && community?.review_status === "pending") {
      return {
        reviewState: "pending",
        kind: "community_request",
        community,
      };
    }
  }

  for (const membership of memberships) {
    if (membership.status !== "pending") continue;
    const community = fallbackCommunity(membership);
    if (!community) continue;
    if (community.review_status === "pending" || community.review_status === "rejected") continue;

    return {
      reviewState: "pending",
      kind: "membership_approval",
      community,
    };
  }

  for (const membership of memberships) {
    const community = membership.community;
    if (
      membership.status === "approved" &&
      community &&
      community.review_status !== "pending"
    ) {
      return {
        reviewState: "approved",
        kind: "membership_approval",
        community,
      };
    }
  }

  return null;
}

export function getRejectedCommunity(user) {
  return getRejectedApprovalDetails(user)?.community ?? null;
}

export function getRejectedApprovalDetails(user) {
  const resolved = resolveOnboardingReviewState(user);
  if (!resolved || resolved.reviewState !== "rejected") return null;

  return {
    community: resolved.community,
    kind: resolved.kind,
    rejection_reason: resolved.rejection_reason ?? null,
    rejected_by: resolved.rejected_by ?? null,
  };
}

export const isCommunityAdminRole = actingContext.isCommunityAdminRole;
export const hasApprovedAdminMembership = actingContext.hasApprovedAdminMembership;
export const hasCommunityAdminCapability = actingContext.hasCommunityAdminCapability;
export const isResidentMode = actingContext.isResidentMode;

export function currentCommunityId(user) {
  if (user?.active_context_community_id) {
    return Number(user.active_context_community_id);
  }
  const membership = getAdminMembership(user) || getPrimaryMembership(user);
  return membership?.community_id ? Number(membership.community_id) : null;
}

export const canUseResidentMode = actingContext.canSwitchModes;
export const canSwitchModes = actingContext.canSwitchModes;
export const canSwitchToResidentMode = actingContext.canSwitchToResidentMode;
export const canSwitchToAdminMode = actingContext.canSwitchToAdminMode;

/** Region does not require a payment method (e.g. Pakistan / free-billing). */
export function isBillingExempt(user) {
  return Boolean(user?.access?.billing_exempt);
}

/** True when the managed community's region country is Pakistan (Refer & Earn / Plaid are US-only). */
export function isPakistanCommunityRegion(user) {
  const code = String(user?.access?.country_code ?? "").trim().toUpperCase();
  return code === "PK";
}

/** Joined because a community admin (or invite code) added them — not a self-serve request. */
export function joinedViaAdminInvite(user) {
  return (user?.memberships ?? []).some((m) => Boolean(m?.invite_code_used));
}

/** Invited or provisioned by a community/system admin (not self-serve signup). */
export function invitedByAdmin(user) {
  if (user?.invited_by_admin === true) return true;
  if (user?.needs_invite_code) return true;
  return joinedViaAdminInvite(user);
}

/** Hide the 48–72h utility verification note for admin-invited onboarding. */
export function shouldShowUtilityVerificationDelay(user, options = {}) {
  const { invitedParam, isAdminClaim, isCommunityRequest } = options;
  if (isCommunityRequest) return true;
  if (invitedParam === "1" || invitedParam === true) return false;
  if (isAdminClaim) return false;
  if (invitedByAdmin(user)) return false;
  return true;
}

/** Admin-invited/provisioned onboarding uses a plain "Submit" CTA. */
export function shouldUseSimpleCompleteProfileSubmit(user, options = {}) {
  const { invitedParam, isAdminClaim } = options;
  if (invitedParam === "1" || invitedParam === true) return true;
  if (invitedByAdmin(user)) return true;
  if (isAdminClaim && isCommunityAdminRole(user)) return true;
  return false;
}

/**
 * Utility bill is required for every resident and community-admin path.
 * Guests are the only role that skips it.
 */
export function shouldSkipUtilityBill(user) {
  return isGuestUser(user);
}

/** User applied as community admin but system admin has not approved yet. */
export function isCommunityAdminPending(user) {
  return isCommunityAdminRole(user) && (user?.community_admin_status ?? "pending") === "pending";
}

/** Community admin has selected or registered a community during signup. */
export function hasCommunityAdminLinkedCommunity(user) {
  if (!isCommunityAdminRole(user)) return false;

  return (user?.memberships ?? []).some((m) => Boolean(m.community_id));
}

/** System admin approval applies only after the community admin has linked a community. */
export function awaitsCommunityAdminApproval(user) {
  return isCommunityAdminPending(user) && hasCommunityAdminLinkedCommunity(user);
}

function profileIncompleteBeforeApproval(user) {
  if (isCommunityAdminRole(user) && typeof user?.access?.profile_complete === "boolean") {
    return !user.access.profile_complete;
  }

  const profile = user?.profile;
  if (!profile?.display_name?.trim() || !profile?.unit_number?.trim()) return true;
  if (isGuestUser(user) || isCommunityAdminRole(user)) return false;
  return !profile?.residence_type;
}

export function hasLinkedCommunityForProfile(user) {
  if (isCommunityAdminRole(user) && typeof user?.access?.has_linked_community === "boolean") {
    return user.access.has_linked_community;
  }

  return (user?.memberships ?? []).some(
    (m) => m.community_id && m.status !== "rejected" && m.community?.review_status !== "rejected",
  );
}

/** Signup complete but system admin has not fully approved the user and/or their community. */
export function needsSystemApprovalWait(user) {
  if (!user || canAccessDashboard(user)) return false;
  if (profileIncompleteBeforeApproval(user) && hasLinkedCommunityForProfile(user)) return false;

  return (
    hasPendingCommunityRequest(user) ||
    awaitsCommunityAdminApproval(user) ||
    hasPendingMembershipApproval(user)
  );
}

/** Community admin account approved but their new community request is still under review. */
export function awaitsCommunityReviewOnly(user) {
  return (
    isCommunityAdminRole(user) &&
    !isCommunityAdminPending(user) &&
    hasPendingCommunityRequest(user)
  );
}

export function isCommunityAdminRejected(user) {
  return user?.role === "community_admin" && user?.community_admin_status === "rejected";
}

/** Active Community Admin UI — false in Resident Mode even if the account can switch back. */
export const isCommunityAdmin = actingContext.isCommunityAdmin;

const EDITABLE_NOTICE_CATEGORIES = new Set(["general", "maintenance", "security", "finance"]);

/** Community Admin notice-detail edit. Residents, other communities, events, alerts, and bills stay read-only. */
export function canEditCommunityNotice(user, notice) {
  if (!user || !notice || !isCommunityAdmin(user)) return false;
  const managedId = currentCommunityId(user);
  const noticeCommunityId = notice.communityId ?? notice.community_id;
  if (!managedId || noticeCommunityId == null || String(managedId) !== String(noticeCommunityId)) {
    return false;
  }
  if (notice.isEvent || notice.isAlert || notice.serviceBill || notice.amenityBill) return false;
  return EDITABLE_NOTICE_CATEGORIES.has(String(notice.category ?? ""));
}
export const homePathForUser = actingContext.homePathForUser;

/** Primary approved admin community membership */
export function getAdminMembership(user, preferredCommunityId) {
  const admins = (user?.memberships ?? []).filter(
    (m) =>
      m.status === "approved" &&
      ["admin", "moderator"].includes(m.role),
  );
  if (preferredCommunityId != null) {
    const match = admins.find(
      (m) => String(m.community_id) === String(preferredCommunityId),
    );
    if (match) return match;
  }
  return admins[0] ?? null;
}

/** Apply a membership-rejection API error onto cached session user data. */
export function mergeRejectionIntoUser(user, error) {
  if (!user || !error) return user;

  const reason = String(error.reason ?? "").trim() || null;
  const rejectedBy = error.rejectedBy ?? "community_admin";
  const isCommunityRejection = error.code === "COMMUNITY_REQUEST_REJECTED";

  const memberships = (user.memberships ?? []).map((membership) => {
    const community = membership.community;
    if (isCommunityRejection) {
      if (community?.review_status !== "rejected") return membership;
      return {
        ...membership,
        community: {
          ...community,
          review_status: "rejected",
          rejection_reason: reason ?? community.rejection_reason,
        },
      };
    }

    if (membership.status !== "pending" && membership.status !== "rejected") {
      return membership;
    }

    return {
      ...membership,
      status: "rejected",
      rejection_reason: reason ?? membership.rejection_reason ?? null,
      rejected_by: rejectedBy,
    };
  });

  return { ...user, memberships };
}

export function isRejectedStatusError(error) {
  return error?.code === "MEMBERSHIP_REJECTED" || error?.code === "COMMUNITY_REQUEST_REJECTED";
}

/** Merge API review snapshot into cached session user memberships. */
export function mergeReviewSnapshotIntoUser(user, snapshot) {
  if (!user || !snapshot?.community?.id) return user;

  const communityId = snapshot.community.id;
  const memberships = [...(user.memberships ?? [])];
  const index = memberships.findIndex((m) => m.community_id === communityId);
  const existing = index >= 0 ? memberships[index] : null;
  const nextMembership = {
    ...(existing ?? {}),
    community_id: communityId,
    role: existing?.role ?? "member",
    status:
      snapshot.status === "approved"
        ? "approved"
        : snapshot.status === "rejected"
          ? "rejected"
          : "pending",
    rejection_reason: snapshot.rejection_reason ?? existing?.rejection_reason ?? null,
    rejected_by: snapshot.rejected_by ?? existing?.rejected_by ?? null,
    community: {
      ...(existing?.community ?? {}),
      ...snapshot.community,
    },
  };

  if (index >= 0) memberships[index] = nextMembership;
  else memberships.push(nextMembership);

  return { ...user, memberships };
}
