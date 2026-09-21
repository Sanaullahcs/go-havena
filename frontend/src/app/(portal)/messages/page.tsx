"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatShell, type ChatConversation, type ChatMessage } from "@/components/shared/chat";
import {
  fetchConversations,
  fetchConversationMessages,
  sendConversationMessage,
  type Conversation,
} from "@/lib/api/messages";
import { formatConversationTime, formatMessageTime } from "@/lib/admin/message-time";
import { resolveMediaUrl } from "@/lib/media/resolve-url";
import { getUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/client";
import { toastError } from "@/lib/alert";

function participantRole(conv: Conversation): string {
  if (conv.listing?.title) return `Listing · ${conv.listing.title}`;
  return conv.kind === "neighbor" ? "Neighbor" : "Community";
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

function ResidentMessagesInner() {
  const searchParams = useSearchParams();
  const requestedConversationId = Number(searchParams.get("conversation")) || null;
  const sessionUser = getUser();
  const myId = sessionUser?.id ?? 0;
  const myName = sessionUser?.profile?.display_name || sessionUser?.name || "Resident";

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<Record<number, ChatMessage[]>>({});
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const rows = await fetchConversations();
      setConversations(rows.map(toChatConversation));
    } catch (err) {
      if (!silent) {
        setConversations([]);
        toastError(apiError(err));
      }
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, []);

  const loadThread = useCallback(async (conversationId: number, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const { messages: rows } = await fetchConversationMessages(conversationId);
      setMessages((prev) => ({ ...prev, [conversationId]: rows.map(toChatMessage) }));
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
      );
    } catch (err) {
      if (!silent) toastError(apiError(err));
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    const timer = window.setInterval(() => loadConversations(true), 30_000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (requestedConversationId) setActiveId(requestedConversationId);
  }, [requestedConversationId]);

  useEffect(() => {
    if (!activeId) return;
    loadThread(activeId);
    const timer = window.setInterval(() => loadThread(activeId, true), 15_000);
    return () => window.clearInterval(timer);
  }, [activeId, loadThread]);

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, row) => sum + (row.unread ?? 0), 0),
    [conversations],
  );

  const handleSend = async (body: string) => {
    if (!activeId || sending) return;
    setSending(true);
    try {
      const sent = await sendConversationMessage(activeId, body);
      setMessages((prev) => ({
        ...prev,
        [activeId]: [...(prev[activeId] ?? []), toChatMessage(sent)],
      }));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, lastMessage: body, lastTime: "now" } : c,
        ),
      );
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Messages</h1>
          <p className="mt-0.5 text-sm text-slate-500">Chat with your community admin and neighbors.</p>
        </div>
        {unreadTotal > 0 ? (
          <span className="flex h-8 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700">
            {unreadTotal} unread
          </span>
        ) : null}
      </div>

      <ChatShell
        myId={myId}
        myName={myName}
        accentColor="#059669"
        conversations={conversations}
        messages={activeId ? (messages[activeId] ?? []) : []}
        activeId={activeId}
        onSelect={setActiveId}
        onSend={handleSend}
        loadingList={loadingList}
        loadingThread={loadingThread}
        sending={sending}
        emptyListText="No conversations yet. Message a seller from Marketplace or wait for a neighbor to write you."
        emptyText="Select a conversation to start messaging."
      />
    </div>
  );
}

export default function ResidentMessagesPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-slate-400">Loading messages…</div>}>
      <ResidentMessagesInner />
    </Suspense>
  );
}
