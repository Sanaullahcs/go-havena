"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchLandlordAccess, type LandlordAccess } from "@/lib/api/landlord";
import { getUser } from "@/lib/auth/session";
import {
  hasLandlordPortalLoginHint,
  isLandlordOnlyPortal,
  isLandlordWorkspacePath,
  setLandlordPortalLoginHint,
} from "@/lib/landlord-portal";

export type LandlordNavState = {
  /** Slim landlord sidebar (no resident community tabs). */
  landlordPortalNav: boolean;
  /** User may open landlord tools (show link only when true). */
  landlordDashboard: boolean;
};

export function useLandlordNavState(): LandlordNavState {
  const pathname = usePathname();
  const [access, setAccess] = useState<LandlordAccess | null>(null);
  const [hint, setHint] = useState(hasLandlordPortalLoginHint());

  useEffect(() => {
    let cancelled = false;
    const communityId = getUser()?.active_context_community_id ?? getUser()?.community_id ?? undefined;
    void (async () => {
      try {
        const next = await fetchLandlordAccess(communityId);
        if (cancelled) return;
        setAccess(next);
        const only = isLandlordOnlyPortal(next);
        setLandlordPortalLoginHint(only);
        setHint(hasLandlordPortalLoginHint());
      } catch {
        if (!cancelled) {
          setHint(hasLandlordPortalLoginHint());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const landlordDashboard = Boolean(access?.landlord_dashboard);
  const ownerOnly = isLandlordOnlyPortal(access);

  const landlordPortalNav = Boolean(
    ownerOnly
    || hint
    || isLandlordWorkspacePath(pathname, access),
  );

  return { landlordPortalNav, landlordDashboard };
}

/** @deprecated use useLandlordNavState */
export function useLandlordOnlyNav(): boolean {
  return useLandlordNavState().landlordPortalNav;
}