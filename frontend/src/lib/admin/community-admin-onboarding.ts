/** Community admin self-serve onboarding steps (web dashboard + mobile parity). */
export const COMMUNITY_ADMIN_ONBOARDING_STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Community" },
  { id: 3, label: "Profile" },
  { id: 4, label: "Billing" },
] as const;

export function communityAdminOnboardingPath(nextStep: string): string {
  switch (nextStep) {
    case "complete_profile":
      return "/admin/complete-profile";
    case "link_community":
      return "/admin/setup";
    case "complete_billing_web":
      return "/admin/billing";
    case "configure_resident_features":
      return "/admin/pending-approval";
    case "await_approval":
    case "rejected":
      return "/admin/pending-approval";
    case "ready":
    default:
      return "/admin";
  }
}

export const COMMUNITY_ADMIN_ONBOARDING_PATHS = [
  "/admin/setup",
  "/admin/complete-profile",
  "/admin/billing",
  "/admin/pending-approval",
] as const;

export function isCommunityAdminOnboardingPath(pathname: string): boolean {
  return COMMUNITY_ADMIN_ONBOARDING_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Map onboarding routes to step index (Account = 1 … Billing = 4). */
export function onboardingStepFromPath(pathname: string): number | null {
  if (pathname.startsWith("/admin/setup")) return 2;
  if (pathname.startsWith("/admin/complete-profile")) return 3;
  if (pathname === "/admin/billing" || pathname.startsWith("/admin/billing/")) return 4;
  return null;
}
