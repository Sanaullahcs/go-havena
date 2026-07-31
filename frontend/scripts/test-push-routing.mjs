/**
 * Validates web push link mapping across all notification types.
 * Run: node frontend/scripts/test-push-routing.mjs
 */

import assert from "node:assert/strict";

function inferNoticeBoard(hints) {
  const category = (hints?.category ?? "").toLowerCase().trim();
  if (category === "event") return "events";
  if (category === "emergency") return "alerts";
  const haystack = `${hints?.title ?? ""} ${hints?.body ?? ""}`.toLowerCase();
  if (/\bevent\b/.test(haystack)) return "events";
  if (/\balert\b|\bemergency\b/.test(haystack)) return "alerts";
  return "notices";
}

function noticeAdminHref(noticeId, hints) {
  const board = inferNoticeBoard(hints);
  const base =
    board === "events" ? "/admin/events" : board === "alerts" ? "/admin/alerts" : "/admin/notices";
  return `${base}?notice=${noticeId}`;
}

function rerouteAdminNoticeHref(raw, hints) {
  const match = raw.match(/^\/admin\/notices\?notice=(\d+)/);
  if (!match || !hints) return null;
  const board = inferNoticeBoard(hints);
  if (board === "notices") return null;
  const base = board === "events" ? "/admin/events" : "/admin/alerts";
  return `${base}?notice=${match[1]}`;
}

function mapMobileScreenToAdminHref(pathname, query = "") {
  const path = pathname.toLowerCase();
  const params = new URLSearchParams(query);

  if (path.includes("/screens/admin-bookings") || path.includes("/screens/admin-amenities")) {
    return "/admin/amenities";
  }
  if (path.includes("/screens/guest-approvals")) return "/admin/guests";
  if (path.includes("/screens/notices")) return "/admin/notices";
  if (path.includes("/screens/community-feed/comments")) {
    const postId = params.get("postId") ?? params.get("post_id");
    return postId ? `/admin/feed?post=${postId}` : "/admin/feed";
  }
  if (path.includes("/screens/community-feed")) return "/admin/feed";
  if (path.includes("/screens/listing-detail")) {
    const listingId = params.get("id") ?? params.get("listingId") ?? params.get("listing_id");
    return listingId ? `/admin/marketplace?listing=${listingId}` : "/admin/marketplace";
  }
  if (path.includes("/screens/messages")) return "/admin/messages";
  if (path.includes("/screens/property-management/my-booking")) return "/admin/amenities";
  return null;
}

function resolvePushLink(raw, hints) {
  if (!raw || typeof raw !== "string") return "/admin/notifications";
  let action = raw.trim();
  if (action.startsWith("http://") || action.startsWith("https://")) {
    try {
      const parsed = new URL(action);
      action = parsed.pathname + parsed.search;
    } catch {
      return "/admin/notifications";
    }
  }
  if (action.startsWith("/admin/")) {
    return rerouteAdminNoticeHref(action, hints) ?? action;
  }
  if (action.includes("/screens/messages/chat")) {
    const params = new URLSearchParams(action.includes("?") ? action.slice(action.indexOf("?") + 1) : "");
    const conversationId = params.get("conversationId");
    return conversationId ? `/admin/messages?conversation=${conversationId}` : "/admin/messages";
  }
  if (action.includes("/screens/community-feed/comments")) {
    const params = new URLSearchParams(action.includes("?") ? action.slice(action.indexOf("?") + 1) : "");
    const postId = params.get("postId");
    return postId ? `/admin/feed?post=${postId}` : "/admin/feed";
  }
  const noticeMatch = action.match(/\/notices\/(\d+)/);
  if (noticeMatch) return noticeAdminHref(noticeMatch[1], hints);
  if (action.startsWith("/screens/")) {
    const qIdx = action.indexOf("?");
    const pathname = qIdx === -1 ? action : action.slice(0, qIdx);
    const query = qIdx === -1 ? "" : action.slice(qIdx + 1);
    return mapMobileScreenToAdminHref(pathname, query) ?? "/admin/notifications";
  }
  return action.startsWith("/") ? action : "/admin/notifications";
}

function enrichPushContent(data) {
  let title = data.title || "";
  let body = data.body || "";
  const kind = data.kind || "";
  const actor = data.actor_name || "";

  if (!title) {
    if (kind === "post_comment") title = "New comment";
    else title = "NeighborLink";
  }
  if (!body && kind === "post_comment" && actor) {
    body = `${actor} commented on your post.`;
  }
  return { title, body };
}

const cases = [
  {
    input: "/screens/admin-bookings",
    expected: "/admin/amenities",
    label: "amenity booking request → amenities",
  },
  {
    input: "/screens/admin-amenities",
    expected: "/admin/amenities",
    label: "admin amenities screen → amenities",
  },
  {
    input: "/screens/guest-approvals",
    expected: "/admin/guests",
    label: "guest approvals → guests",
  },
  {
    input: "/screens/notices",
    expected: "/admin/notices",
    label: "notices screen → notices",
  },
  {
    input: "/screens/listing-detail?id=7",
    expected: "/admin/marketplace?listing=7",
    label: "listing detail → marketplace",
  },
  {
    input: "/screens/community-feed/comments?postId=3",
    expected: "/admin/feed?post=3",
  },
  {
    input: "http://localhost:3000/screens/community-feed/comments?postId=3",
    expected: "/admin/feed?post=3",
  },
  {
    input: "/screens/messages/chat?conversationId=12",
    expected: "/admin/messages?conversation=12",
  },
  {
    input: "http://localhost:3000/admin/feed?post=5",
    expected: "/admin/feed?post=5",
  },
  {
    input: "/notices/42",
    hints: { title: "Event Update", body: "Jane joined your event." },
    expected: "/admin/events?notice=42",
  },
  {
    input: "/notices/7",
    hints: { title: "New Event", body: "Community BBQ" },
    expected: "/admin/events?notice=7",
  },
  {
    input: "/notices/9",
    hints: { category: "emergency", title: "New Alert" },
    expected: "/admin/alerts?notice=9",
  },
  {
    input: "/notices/11",
    hints: { title: "New Notice", body: "Pool maintenance" },
    expected: "/admin/notices?notice=11",
  },
  {
    input: "/admin/notices?notice=42",
    hints: { title: "Event Update" },
    expected: "/admin/events?notice=42",
  },
  {
    input: "/screens/property-management/my-booking",
    expected: "/admin/amenities",
    label: "resident booking screen maps for admin web",
  },
  {
    input: "/screens/unknown-screen",
    expected: "/admin/notifications",
    label: "unknown screen fallback",
  },
];

for (const { input, expected, hints, label } of cases) {
  assert.equal(resolvePushLink(input, hints), expected, label ?? `resolvePushLink(${input})`);
}

const enriched = enrichPushContent({ kind: "post_comment", actor_name: "Jane Doe" });
assert.equal(enriched.title, "New comment");
assert.equal(enriched.body, "Jane Doe commented on your post.");

console.log(`OK: ${cases.length} link mapping cases + content enrichment passed.`);
