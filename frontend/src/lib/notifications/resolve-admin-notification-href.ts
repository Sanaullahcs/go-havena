/**
 * Maps API/mobile notification action URLs to valid admin dashboard routes.
 * Unknown destinations fall back to /admin/notifications (never a raw 404 path).
 */

export type NoticeRoutingHints = {
  category?: string | null;
  title?: string | null;
  body?: string | null;
};

export type NoticeBoard = "events" | "alerts" | "notices";

const KNOWN_ADMIN_PREFIXES = [
  "/admin/amenities",
  "/admin/units",
  "/admin/services",
  "/admin/service-bills",
  "/admin/bookings",
  "/admin/events",
  "/admin/alerts",
  "/admin/notices",
  "/admin/feed",
  "/admin/marketplace",
  "/admin/messages",
  "/admin/guests",
  "/admin/members",
  "/admin/moderation",
  "/admin/notifications",
  "/admin/residents",
  "/admin/communities",
  "/admin/community-admins",
  "/admin/documents",
  "/admin/wellness",
  "/admin/profile",
  "/admin",
] as const;

export function inferNoticeBoard(hints?: NoticeRoutingHints): NoticeBoard {
  const category = hints?.category?.toLowerCase().trim();
  if (category === "event") return "events";
  if (category === "emergency") return "alerts";

  const haystack = `${hints?.title ?? ""} ${hints?.body ?? ""}`.toLowerCase();
  if (/\bevent\b/.test(haystack)) return "events";
  if (/\balert\b|\bemergency\b/.test(haystack)) return "alerts";

  return "notices";
}

function noticeAdminHref(noticeId: string, hints?: NoticeRoutingHints): string {
  const board = inferNoticeBoard(hints);
  const base =
    board === "events" ? "/admin/events" : board === "alerts" ? "/admin/alerts" : "/admin/notices";
  return `${base}?notice=${noticeId}`;
}

function rerouteAdminNoticeHref(raw: string, hints?: NoticeRoutingHints): string | null {
  const match = raw.match(/^\/admin\/notices\?notice=(\d+)/);
  if (!match || !hints) return null;

  const board = inferNoticeBoard(hints);
  if (board === "notices") return null;

  const base = board === "events" ? "/admin/events" : "/admin/alerts";
  return `${base}?notice=${match[1]}`;
}

function isKnownAdminHref(href: string): boolean {
  const path = href.split("?")[0] ?? href;
  if (path === "/admin" || path === "/admin/") return true;
  return KNOWN_ADMIN_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`),
  );
}

function mapMobileScreenToAdminHref(pathname: string, query = ""): string | null {
  const path = pathname.toLowerCase();
  const params = new URLSearchParams(query);

  if (path.includes("/screens/admin-content-review")) {
    const kind = (params.get("kind") ?? "").toLowerCase();
    if (kind === "event") return "/admin/events?review_status=pending";
    if (kind === "alert") return "/admin/alerts?review_status=pending";
    return "/admin/notices?review_status=pending";
  }

  if (path.includes("/screens/admin-bookings")) {
    return "/admin/bookings";
  }

  if (path.includes("/screens/admin-amenity-bills") || path.includes("amenity_bill")) {
    return "/admin/amenity-bills";
  }

  if (path.includes("/screens/admin-amenities")) {
    return "/admin/amenities";
  }

  if (path.includes("/screens/admin-units") || path === "/admin/units") {
    const unitId = params.get("unitId") ?? params.get("unit_id") ?? params.get("unit");
    const unitNumber = params.get("unitNumber") ?? params.get("unit_number");
    if (unitId) return `/admin/units?unit=${encodeURIComponent(unitId)}`;
    if (unitNumber) return `/admin/units?unitNumber=${encodeURIComponent(unitNumber)}`;
    return "/admin/units";
  }

  if (path.includes("/screens/admin-service-bills") || path.includes("/screens/property-management/unit-bills")) {
    return "/admin/service-bills";
  }

  if (path.includes("/screens/admin-services") || path.includes("/screens/property-management/available-services")) {
    return "/admin/services";
  }

  if (path.includes("/screens/guest-approvals")) {
    return "/admin/guests";
  }

  if (path.includes("/screens/notices") || path === "/notices") {
    return "/admin/notices";
  }

  if (path.includes("/screens/community-feed/comments")) {
    const postId = params.get("postId") ?? params.get("post_id");
    return postId ? `/admin/feed?post=${postId}` : "/admin/feed";
  }

  if (path.includes("/screens/community-feed")) {
    return "/admin/feed";
  }

  if (path.includes("/screens/listing-detail") || path.includes("/screens/community-listings")) {
    const listingId = params.get("id") ?? params.get("listingId") ?? params.get("listing_id");
    return listingId ? `/admin/marketplace?listing=${listingId}` : "/admin/marketplace";
  }

  if (path.includes("/screens/messages")) {
    return "/admin/messages";
  }

  if (
    path.includes("/screens/property-management/my-booking") ||
    path.includes("/screens/property-management/amenity") ||
    path.includes("/screens/property-management")
  ) {
    return "/admin/amenities";
  }

  if (path.includes("/screens/invite-code") || path.includes("/screens/pending-community")) {
    return "/admin/members";
  }

  if (path.includes("/screens/admin-dashboard")) {
    return "/admin";
  }

  if (path.includes("/screens/notification")) {
    return "/admin/notifications";
  }

  return null;
}

function mapByHints(type?: string, hints?: NoticeRoutingHints): string | null {
  if (type === "message") return "/admin/messages";

  const haystack = `${hints?.title ?? ""} ${hints?.body ?? ""}`.toLowerCase();
  if (haystack.includes("pending approval") || (haystack.includes("submitted") && haystack.includes("for review"))) {
    const board = inferNoticeBoard(hints);
    const base =
      board === "events" ? "/admin/events" : board === "alerts" ? "/admin/alerts" : "/admin/notices";
    return `${base}?review_status=pending`;
  }

  if (type === "warning") return "/admin/moderation";
  return null;
}

export function resolveAdminNotificationHref(
  actionUrl?: string | null,
  type?: "info" | "success" | "warning" | "message" | "system",
  hints?: NoticeRoutingHints,
): string | null {
  if (!actionUrl?.trim()) {
    return mapByHints(type, hints);
  }

  const raw = actionUrl.trim();

  if (raw.startsWith("/admin/")) {
    const rerouted = rerouteAdminNoticeHref(raw, hints) ?? raw;
    return isKnownAdminHref(rerouted) ? rerouted : "/admin/notifications";
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      const path = url.pathname + url.search;
      if (path.startsWith("/admin/")) {
        const rerouted = rerouteAdminNoticeHref(path, hints) ?? path;
        return isKnownAdminHref(rerouted) ? rerouted : "/admin/notifications";
      }
      return resolveAdminNotificationHref(path, type, hints) ?? "/admin/notifications";
    } catch {
      return "/admin/notifications";
    }
  }

  if (raw === "/screens/notification" || raw.startsWith("/screens/notification")) {
    return "/admin/notifications";
  }

  if (raw.includes("/screens/messages/chat")) {
    const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    const conversationId = params.get("conversationId") ?? params.get("conversation_id");
    return conversationId ? `/admin/messages?conversation=${conversationId}` : "/admin/messages";
  }

  if (raw.includes("/screens/community-feed/comments")) {
    const params = new URLSearchParams(raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "");
    const postId = params.get("postId") ?? params.get("post_id");
    return postId ? `/admin/feed?post=${postId}` : "/admin/feed";
  }

  const noticeMatch = raw.match(/\/notices\/(\d+)/);
  if (noticeMatch) {
    return noticeAdminHref(noticeMatch[1], hints);
  }

  if (raw.startsWith("/messages")) return "/admin/messages";
  if (raw.startsWith("/marketplace")) return "/admin/marketplace";
  if (raw.startsWith("/moderation")) return "/admin/moderation";
  if (raw.startsWith("/members")) return "/admin/members";
  if (raw.startsWith("/feed")) return "/admin/feed";

  if (raw.startsWith("/screens/") || raw === "/notices") {
    const queryIndex = raw.indexOf("?");
    const pathname = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
    const query = queryIndex === -1 ? "" : raw.slice(queryIndex + 1);
    const mapped = mapMobileScreenToAdminHref(pathname, query);
    if (mapped) return mapped;
    return mapByHints(type, hints) ?? "/admin/notifications";
  }

  // Never return an unknown absolute path that could 404 in the dashboard.
  return mapByHints(type, hints) ?? "/admin/notifications";
}
