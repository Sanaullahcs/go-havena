import api from "./client";
import { getAdminCommunityId } from "./members";

export type ConversationListing = {
  id: number;
  title: string;
  price?: number | string | null;
  image_url?: string | null;
};

export type Conversation = {
  id: number;
  type: string;
  kind: "listing" | "neighbor";
  title?: string | null;
  listing_id?: number | null;
  other_id: number;
  other_name: string;
  other_avatar_url?: string | null;
  unread_count: number;
  last_message?: string | null;
  last_message_type?: string | null;
  last_message_at?: string | null;
  listing?: ConversationListing | null;
};

export type Message = {
  id: number;
  body: string;
  content?: string;
  type: string;
  created_at: string;
  sender_id: number;
  sender_name: string;
};

export type CommunityMember = {
  id: number;
  name: string;
  avatar_url?: string | null;
  unit?: string | null;
  role?: string;
};

function scopedRequestConfig() {
  const communityId = getAdminCommunityId();
  return {
    params: communityId ? { community_id: communityId } : undefined,
    headers: communityId ? { "X-Community-Id": String(communityId) } : undefined,
  };
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await api.get("/v1/conversations", scopedRequestConfig());
  return res.data?.data ?? [];
}

export async function fetchConversationMessages(conversationId: number): Promise<{
  messages: Message[];
  listing: ConversationListing | null;
}> {
  const res = await api.get(`/v1/conversations/${conversationId}/messages`, scopedRequestConfig());
  return {
    messages: res.data?.data ?? [],
    listing: res.data?.meta?.conversation ?? null,
  };
}

export async function sendConversationMessage(conversationId: number, body: string): Promise<Message> {
  const res = await api.post(
    `/v1/conversations/${conversationId}/messages`,
    { body },
    scopedRequestConfig(),
  );
  return res.data?.data;
}

export async function startConversation(recipientId: number, message?: string): Promise<number> {
  const res = await api.post(
    "/v1/conversations",
    {
      recipient_id: recipientId,
      ...(message?.trim() ? { message: message.trim() } : {}),
    },
    scopedRequestConfig(),
  );
  return res.data?.data?.conversation_id;
}

export async function fetchMessageableMembers(search = ""): Promise<CommunityMember[]> {
  const communityId = getAdminCommunityId();
  const res = await api.get("/v1/community-members", {
    params: {
      ...(communityId ? { community_id: communityId } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      limit: 50,
    },
    headers: communityId ? { "X-Community-Id": String(communityId) } : undefined,
  });
  return res.data?.data ?? [];
}

export const MESSAGES_UNREAD_EVENT = "havena-messages-unread";

export function emitMessagesUnread(count: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MESSAGES_UNREAD_EVENT, { detail: { count } }));
}

export async function fetchMessageUnreadCount(): Promise<number> {
  const conversations = await fetchConversations();
  return conversations.reduce((sum, row) => sum + (row.unread_count ?? 0), 0);
}
