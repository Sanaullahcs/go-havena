import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import type { AuthUser } from "@/lib/api/auth";
import {
  canAccessCommunityDashboard,
  getCommunityAdminNextStep,
  isCommunityAdminUser,
  isSystemAdminUser,
  resolveResidentDestination,
  type WebUser,
} from "@/lib/auth/session";

export type AuthAudience = "resident" | "admin";

export function resolvePostAuthPath(
  user: AuthUser | WebUser | null | undefined,
  options?: { planQuery?: string; billingReturnPath?: string },
): string {
  if (!user) return "/login";

  if (isSystemAdminUser(user)) {
    return "/admin/community-admins";
  }

  if (isCommunityAdminUser(user)) {
    const step = getCommunityAdminNextStep(user);
    if (canAccessCommunityDashboard(user) || step === "ready") {
      return options?.billingReturnPath || "/admin";
    }
    return `${communityAdminOnboardingPath(step)}${options?.planQuery ?? ""}`;
  }

  return resolveResidentDestination(user);
}
