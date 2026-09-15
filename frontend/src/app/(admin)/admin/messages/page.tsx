"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatShell, type ChatConversation, type ChatMessage } from "@/components/shared/chat";
import { AdminNewChatSheet } from "@/components/admin/admin-new-chat-sheet";
import {
  fetchConversations,
  fetchConversationMessages,
  sendConversationMessage,
  startConversation,
  type Conversation,
  type CommunityMember,
} from "@/lib/api/messages";
import { formatConversationTime, formatMessageTime } from "@/lib/admin/message-time";
import { resolveMediaUrl } from "@/lib/media/resolve-url";
import { getUser, updateUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import { Plus } from "lucide-react";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";

function participantRole(conv: Conversation): string {
  if (conv.listing?.title) {
    return `Listing · ${conv.listing.title}`;
  }
  return "Resident";
}

function toChatConversation(conv: Conversation): ChatConversation {
  return {
    id: conv.id,
    participant: {
      id: conv.other_id,
      name: conv.other_name,
      role: participantRole(conv),
      avatar: resolveMediaUrl(conv.other_avatar_url) ?? undefined,
    },
    lastMessage: conv.last_message ?? "",
    lastTime: formatConversationTime(conv.last_message_at),
    unread: conv.unread_count ?? 0,
  };
}

function toChatMessage(msg: { id: number; sender_id: number; sender_name: string; body: string; created_at: string }): ChatMessage {
  return {
    id: msg.id,
    senderId: msg.sender_id,
    senderName: msg.sender_name,
    body: msg.body,
    time: formatMessageTime(msg.created_at),
  };
}

export default function AdminMessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get("conversation");
  const requestedConversationId = conversationParam ? Number(conversationParam) : null;

  const [sessionUser, setSessionUser] = useState(() => getUser());
  const myId = sessionUser?.id ?? 0;
  const myName = sessionUser?.profile?.display_name || sessionUser?.name || "Admin";

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<Record<number, ChatMessage[]>>({});
  const [activeId, setActiveId] = useState<number | null>(null);
  const [listingContext, setListingContext] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true);
    setListError(null);
    try {
      const rows = await fetchConversations();
      setConversations(rows.map(toChatConversation));
    } catch (err) {
      const message = apiError(err);
      setListError(message);
      if (!silent) setConversations([]);
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, []);

  const loadThread = useCallback(async (conversationId: number, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const { messages: rows, listing } = await fetchConversationMessages(conversationId);
      setMessages((prev) => ({
        ...prev,
        [conversationId]: rows.map(toChatMessage),
      }));
      setListingContext(listing?.title ? `About listing: ${listing.title}` : null);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
      );
    } catch (err) {
      toastError(apiError(err));
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        const nextUser = meToSessionUser(me);
        updateUser(nextUser);
        setSessionUser((prev) => ({ ...(prev ?? {}), ...nextUser, id: nextUser.id ?? prev?.id ?? 0 }));
      } catch {
        /* keep cached session */
      }

      if (!cancelled) {
        await loadConversations();
      }
    }

    bootstrap();
    const timer = window.setInterval(() => loadConversations(true), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!requestedConversationId || Number.isNaN(requestedConversationId)) return;
    setActiveId(requestedConversationId);
    if (!messages[requestedConversationId]) {
      loadThread(requestedConversationId);
    }
  }, [requestedConversationId, loadThread, messages]);

  useEffect(() => {
    if (!activeId) return;
    loadThread(activeId);
    const timer = window.setInterval(() => loadThread(activeId, true), 15_000);
    return () => window.clearInterval(timer);
  }, [activeId, loadThread]);

  const activeMessages = activeId ? (messages[activeId] ?? []) : [];
  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  const handleSelect = (id: number) => {
    setActiveId(id);
    if (!messages[id]) {
      loadThread(id);
    } else {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    }
  };

  const handleSend = async (body: string) => {
    if (!activeId || sending) return;
    setSending(true);
    try {
      const sent = await sendConversationMessage(activeId, body);
      const chatMsg = toChatMessage(sent);
      setMessages((prev) => ({
        ...prev,
        [activeId]: [...(prev[activeId] ?? []), chatMsg],
      }));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, lastMessage: body, lastTime: "now", unread: 0 } : c,
        ),
      );
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSending(false);
    }
  };

  const handleCloseChat = () => {
    setActiveId(null);
    setListingContext(null);
    if (conversationParam) {
      router.replace("/admin/messages");
    }
  };

  const handleStartChat = async (member: CommunityMember) => {
    setNewChatOpen(false);
    try {
      const conversationId = await startConversation(member.id);
      await loadConversations(true);
      setActiveId(conversationId);
      await loadThread(conversationId);
      toastSuccess(`Chat opened with ${member.name}.`);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Messages</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Direct chats with residents — replies sync with the mobile app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadTotal > 0 ? (
            <span className="flex h-8 items-center rounded-lg border border-blue-100 bg-blue-50 px-3 text-xs font-semibold text-blue-700">
              {unreadTotal} unread
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            className="nl-btn-primary h-9 px-4 text-sm"
          >
            <Plus />
            New message
          </button>
        </div>
      </div>

      {listError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError}
          <button type="button" onClick={() => loadConversations()} className="ml-2 font-semibold underline">
            Retry
          </button>
        </div>
      ) : null}

      <ChatShell
        myId={myId}
        myName={myName}
        accentColor="#1B4F8A"
        conversations={conversations}
        messages={activeMessages}
        activeId={activeId}
        onSelect={handleSelect}
        onSend={handleSend}
        searchPlaceholder="Search residents…"
        emptyText="Select a conversation or start a new message."
        loadingList={loadingList}
        loadingThread={loadingThread}
        sending={sending}
        threadSubtitle={listingContext}
        hideHeaderActions
        onClose={handleCloseChat}
        emptyListText={
          conversations.length === 0 && !loadingList && !listError
            ? "No conversations yet."
            : undefined
        }
      />

      <AdminNewChatSheet open={newChatOpen} onClose={() => setNewChatOpen(false)} onSelect={handleStartChat} />
    </div>
  );
}
