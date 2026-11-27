import type { LandlordAccess } from "@/lib/api/landlord";

export const LANDLORD_PORTAL_LOGIN_KEY = "havena_landlord_portal_login";

/** Owner-only or approved landlord without active residency — no resident community tabs. */
export function isLandlordOnlyPortal(access: LandlordAccess | null | undefined): boolean {
  if (!access) return false;
  return Boolean(
    access.owner_only
    || (access.landlord_dashboard && !access.resident),
  );
}

const LANDLORD_ALLOWED_PREFIXES = ["/landlord", "/units", "/payments", "/profile", "/support", "/property"];

export function isLandlordPortalRoute(pathname: string): boolean {
  return landlordPortalPathAllowed(pathname);
}

export function landlordPortalPathAllowed(pathname: string): boolean {
  return LANDLORD_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Landlord unit bills use the Property hub; keep the slim landlord nav while you are there. */
export function isLandlordWorkspacePath(
  pathname: string,
  access: LandlordAccess | null | undefined,
): boolean {
  if (!access?.landlord_dashboard) return false;
  return landlordPortalPathAllowed(pathname);
}

export function setLandlordPortalLoginHint(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      sessionStorage.setItem(LANDLORD_PORTAL_LOGIN_KEY, "1");
    } else {
      sessionStorage.removeItem(LANDLORD_PORTAL_LOGIN_KEY);
    }
  } catch {
    // ignore
  }
}

export function hasLandlordPortalLoginHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(LANDLORD_PORTAL_LOGIN_KEY) === "1";
  } catch {
    return false;
  }
}