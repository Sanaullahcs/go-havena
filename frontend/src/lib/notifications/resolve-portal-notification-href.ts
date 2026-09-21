/**
 * Maps API/mobile notification action URLs to resident portal routes.
 */

export type PortalNoticeHints = {
  category?: string | null;
  title?: string | null;
  body?: string | null;
};

function mapByHints(type?: string, hints?: PortalNoticeHints): string | null {
  if (type === "message") return "/messages";

  const haystack = `${hints?.title ?? ""} ${hints?.body ?? ""}`.toLowerCase();
  if (haystack.includes("listing") || haystack.includes("marketplace")) {
    return "/marketplace";
  }
  if (haystack.includes("event") || haystack.includes("notice") || haystack.includes("alert")) {
    return "/notices";
  }
  if (haystack.includes("post") || haystack.includes("comment") || haystack.includes("liked")) {
    return "/feed";
  }

  return null;
}

export function resolvePortalNotificationHref(
  actionUrl?: string | null,
  type?: "info" | "success" | "warning" | "message" | "system",
  hints?: PortalNoticeHints,
): string | null {
  if (!actionUrl?.trim()) {
    return mapByHints(type, hints);
  }

  const raw = actionUrl.trim();

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      return resolvePortalNotificationHref(url.pathname + url.search, type, hints) ?? "/feed";
    } catch {
      return "/feed";
    }
  }

  if (raw.includes("/screens/community-feed/comments") || raw.includes("/feed/comments")) {
    const params = new URLSearchParams(raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "");
    const postId = params.get("postId") ?? params.get("post_id");
    return postId ? `/feed?post=${postId}` : "/feed";
  }

  if (raw.includes("/screens/community-feed") || raw === "/feed" || raw.startsWith("/feed?")) {
    return raw.startsWith("/feed") ? raw : "/feed";
  }

  if (raw.includes("/screens/messages") || raw.startsWith("/messages")) {
    if (raw.includes("conversationId") || raw.includes("conversation_id")) {
      const params = new URLSearchParams(raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "");
      const conversationId = params.get("conversationId") ?? params.get("conversation_id");
      return conversationId ? `/messages?conversation=${conversationId}` : "/messages";
    }
    return "/messages";
  }

  if (raw.includes("/screens/listing-detail") || raw.includes("/screens/community-listings") || raw.startsWith("/marketplace")) {
    const params = new URLSearchParams(raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "");
    const listingId = params.get("id") ?? params.get("listingId") ?? params.get("listing_id");
    return listingId ? `/marketplace?listing=${listingId}` : "/marketplace";
  }

  if (raw.includes("/screens/notices") || raw.includes("/notices/") || raw === "/notices") {
    const noticeMatch = raw.match(/\/notices\/(\d+)/);
    return noticeMatch ? `/notices?notice=${noticeMatch[1]}` : "/notices";
  }

  if (raw.includes("/screens/property-management") || raw.startsWith("/property")) {
    return "/property";
  }

  if (raw.includes("/screens/notification")) {
    return "/feed";
  }

  if (raw.startsWith("/admin/")) {
    // Residents should never land on admin routes from inbox taps.
    return mapByHints(type, hints) ?? "/feed";
  }

  return mapByHints(type, hints) ?? "/feed";
}
