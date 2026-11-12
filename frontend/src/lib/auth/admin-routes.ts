import { isPlaidAvailable } from "@/lib/plaid-eligibility";
import { isCommunityAdminUser, isPakistanCommunityRegion, isSystemAdminUser, type WebUser } from "@/lib/auth/session";

/** Routes reserved for system administrators (platform scope). */
export const SYSTEM_ADMIN_ROUTE_PREFIXES = [
  "/admin/community-admins",
  "/admin/residents",
  "/admin/communities",
  "/admin/regions",
  "/admin/request-demo",
  "/admin/contact-messages",
  "/admin/wellness",
  "/admin/billing-plans",
  "/admin/billing-coupons",
  "/admin/bank-payments",
  "/admin/kuickpay-oversight",
  "/admin/referrals",
  "/admin/app-version",
  "/admin/moderation",
  "/admin/analytics",
  "/admin/users",
  "/admin/community-requests",
  "/admin/activity",
  "/admin/feature-requests",
  "/admin/support-complaints",
] as const;

/** Routes reserved for community administrators (single-community scope). */
export const COMMUNITY_ADMIN_ROUTE_PREFIXES = [
  "/admin/members",
  "/admin/billing",
  "/admin/plaid",
  "/admin/kuickpay",
  "/admin/guests",
  "/admin/messages",
  "/admin/notices",
  "/admin/events",
  "/admin/alerts",
  "/admin/community-rules",
  "/admin/documents",
  "/admin/complaints",
  "/admin/units",
  "/admin/services",
  "/admin/local-essentials",
  "/admin/service-bills",
  "/admin/amenities",
  "/admin/amenity-bills",
  "/admin/bookings",
  "/admin/feed",
  "/admin/marketplace",
  "/admin/businesses",
  "/admin/refer-and-earn",
  "/admin/feature-settings",
] as const;

const SHARED_ADMIN_ROUTES = new Set([
  "/admin",
  "/admin/setup",
  "/admin/complete-profile",
  "/admin/profile",
  "/admin/support",
  "/admin/notifications",
  "/admin/messages",
]);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isSystemAdminRoute(pathname: string): boolean {
  return SYSTEM_ADMIN_ROUTE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isCommunityAdminRoute(pathname: string): boolean {
  return COMMUNITY_ADMIN_ROUTE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

/** Unlisted system-admin sign-in — not linked from the public site. */
export const SYSTEM_ADMIN_LOGIN_PATH = "/system-login";

/** Pick the correct admin sign-in page for the current portal context. */
export function resolveAdminLoginPath(options?: {
  pathname?: string;
  user?: WebUser | null;
}): "/login" | typeof SYSTEM_ADMIN_LOGIN_PATH {
  if (isSystemAdminUser(options?.user ?? null)) {
    return SYSTEM_ADMIN_LOGIN_PATH;
  }

  const pathname =
    options?.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");

  if (pathname && isSystemAdminRoute(pathname)) {
    return SYSTEM_ADMIN_LOGIN_PATH;
  }

  return "/login";
}

/** Redirect target when the signed-in admin hits a route outside their portal. */
export function resolveAdminPortalRedirect(pathname: string, user: WebUser | null): string | null {
  if (!pathname.startsWith("/admin")) return null;
  if (SHARED_ADMIN_ROUTES.has(pathname)) return null;

  if (isSystemAdminUser(user)) {
    if (!isCommunityAdminRoute(pathname)) return null;
    return pathname.startsWith("/admin/members") ? "/admin/residents" : "/admin";
  }

  if (isCommunityAdminUser(user)) {
    if (matchesPrefix(pathname, "/admin/plaid") && !isPlaidAvailable(user)) {
      return "/admin";
    }
    if (matchesPrefix(pathname, "/admin/kuickpay") && !isPakistanCommunityRegion(user)) {
      return "/admin";
    }
    if (matchesPrefix(pathname, "/admin/refer-and-earn") && isPakistanCommunityRegion(user)) {
      return "/admin";
    }
    if (!isSystemAdminRoute(pathname)) return null;
    return "/admin";
  }

  return null;
}
