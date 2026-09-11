/**
 * Complete-profile field visibility — mirrors
 * apps/mobile/app/screens/complete-profile/index.jsx and
 * apps/mobile/services/community-access.js.
 */

export type CompleteProfileUser = {
  role?: string | null;
  community_admin_status?: string | null;
  memberships?: Array<{
    role?: string | null;
    status?: string | null;
    invite_code_used?: string | null;
  }>;
};

/** System-dashboard defaults for provisioned community admins — treat as unset. */
const PLACEHOLDER_UNIT_NUMBERS = new Set(["office", "management office"]);
const PLACEHOLDER_RESIDENCE_TYPES = new Set(["management", "office"]);

export function isPlaceholderUnitNumber(unit: string | null | undefined): boolean {
  const trimmed = String(unit ?? "").trim();
  if (!trimmed) return true;
  return PLACEHOLDER_UNIT_NUMBERS.has(trimmed.toLowerCase());
}

export function isPlaceholderResidenceType(type: string | null | undefined): boolean {
  const trimmed = String(type ?? "").trim();
  if (!trimmed) return true;
  if (trimmed === "homeowner" || trimmed === "tenant") return false;
  return PLACEHOLDER_RESIDENCE_TYPES.has(trimmed.toLowerCase());
}

export function isGuestProfile(user?: CompleteProfileUser | null): boolean {
  if (user?.role === "guest") return true;
  return (user?.memberships ?? []).some(
    (m) => m.role === "guest" && m.status === "approved",
  );
}

export function isCommunityAdminRole(user?: CompleteProfileUser | null): boolean {
  return user?.role === "community_admin";
}

export function joinedViaAdminInvite(user?: CompleteProfileUser | null): boolean {
  return (user?.memberships ?? []).some((m) => Boolean(m?.invite_code_used));
}

/**
 * Utility bill is required for every resident and community-admin path.
 * Guests are the only role that skips it.
 */
export function shouldSkipUtilityBill(
  user?: CompleteProfileUser | null,
  _options: { role?: string } = {},
): boolean {
  return isGuestProfile(user);
}

/** Mobile route `role=admin` for community-admin onboarding; residents keep their role. */
export function completeProfileOnboardingRole(
  user?: CompleteProfileUser | null,
): "admin" | "resident" | "guest" {
  if (isGuestProfile(user)) return "guest";
  if (isCommunityAdminRole(user) || user?.role === "admin") return "admin";
  return "resident";
}

export type CompleteProfileFieldVisibility = {
  isGuestProfile: boolean;
  showFamilyNumberField: boolean;
  showResidenceType: boolean;
  showUtilityBill: boolean;
  skipUtilityBill: boolean;
  unitRequired: boolean;
};

export function getCompleteProfileFieldVisibility(input: {
  user?: CompleteProfileUser | null;
  role?: string;
  invited?: boolean;
  communityRequest?: boolean;
}): CompleteProfileFieldVisibility {
  const role = input.role ?? completeProfileOnboardingRole(input.user);
  const guest = isGuestProfile(input.user);
  const skip = shouldSkipUtilityBill(input.user, { role });
  const showResidenceType = !guest;

  return {
    isGuestProfile: guest,
    // Hidden for all community admins and community-request signups (mobile: role !== "admin" && !communityRequest).
    showFamilyNumberField: role !== "admin" && !input.communityRequest && !guest,
    showResidenceType,
    showUtilityBill: showResidenceType && !skip,
    skipUtilityBill: skip,
    unitRequired: !guest,
  };
}
