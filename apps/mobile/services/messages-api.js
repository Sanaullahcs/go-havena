import { apiRequest } from "./api-client";

export async function fetchConversations() {
  const res = await apiRequest("/conversations");
  return res.data ?? [];
}

export async function fetchMessageUnreadCount() {
  try {
    const res = await apiRequest("/conversations/unread-count");
    return Number(res.data?.unread_count ?? 0);
  } catch {
    const conversations = await fetchConversations();
    return conversations.reduce((sum, row) => sum + (row.unread_count ?? 0), 0);
  }
}

export async function fetchCommunityMembers(search = "") {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  const res = await apiRequest(`/community-members${query}`);
  return res.data ?? [];
}

export async function startConversation(recipientId, options = {}) {
  const body = { recipient_id: recipientId };

  if (options.listingId != null) body.listing_id = options.listingId;
  if (options.message) body.message = options.message;
  if (options.offerAmount != null) body.offer_amount = options.offerAmount;

  const res = await apiRequest("/conversations", {
    method: "POST",
    body,
  });
  return res.data;
}

export async function startListingConversation({ recipientId, listingId, message, offerAmount }) {
  return startConversation(recipientId, { listingId, message, offerAmount });
}

export async function fetchMessages(conversationId, { limit = 25, beforeId } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId != null) {
    params.set("before_id", String(beforeId));
  }

  const res = await apiRequest(`/conversations/${conversationId}/messages?${params}`);
  return {
    messages: res.data ?? [],
    listing: res.meta?.conversation ?? null,
    peer: res.meta?.peer ?? null,
    hasMore: Boolean(res.meta?.has_more),
  };
}

/** Normalize peer community role for chat UI. */
export function peerRoleLabel(role) {
  const value = String(role ?? "").toLowerCase();
  if (value === "admin" || value === "moderator" || value === "community_admin") {
    return "Admin";
  }
  return "Resident";
}

export function isPeerAdmin(role) {
  return peerRoleLabel(role) === "Admin";
}

export async function sendMessage(conversationId, content) {
  const res = await apiRequest(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { body: content },
  });
  return res.data;
}
