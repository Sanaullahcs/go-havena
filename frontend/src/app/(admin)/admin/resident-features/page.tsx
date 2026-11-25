"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { canAccessCommunityDashboard, getCommunityAdminNextStep, getUser } from "@/lib/auth/session";

/** Old signup URL. Feature changes live in Settings after the account is approved. */
export default function ResidentFeaturesOnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (canAccessCommunityDashboard(user)) {
      router.replace("/admin/feature-settings");
      return;
    }
    const step = getCommunityAdminNextStep(user);
    const next = step === "configure_resident_features" ? "await_approval" : step;
    router.replace(communityAdminOnboardingPath(next));
  }, [router]);

  return null;
}
