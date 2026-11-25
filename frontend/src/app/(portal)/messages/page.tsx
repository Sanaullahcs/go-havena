"use client";

import { useState } from "react";
import { ChatShell, type ChatConversation, type ChatMessage } from "@/components/shared/chat";
import { toastSuccess } from "@/lib/alert";

const ME = { id: 10, name: "Sarah Mitchell" };

const SEED_CONVS: ChatConversation[] = [
  {
    id: 1,
    participant: { id: 1, name: "Admin Office", role: "Community Admin", online: true },
    lastMessage: "Your request has been assigned to the team.",
    lastTime: "5m",
    unread: 1,
  },
  {
    id: 2,
    participant: { id: 11, name: "James Okafor", role: "Neighbor · Apt 7A", online: true },
    lastMessage: "Are you going to the community BBQ?",
    lastTime: "22m",
    unread: 0,
  },
  {
    id: 3,
    participant: { id: 12, name: "Lisa Wang", role: "Neighbor · Apt 2C", online: false, lastSeen: "2h ago" },
    lastMessage: "Let me know when you're free!",
    lastTime: "2h",
    unread: 0,
  },
  {
    id: 4,
    participant: { id: 13, name: "Michael Torres", role: "Moderator", online: false, lastSeen: "Yesterday" },
    lastMessage: "Your report has been reviewed.",
    lastTime: "Yesterday",
    unread: 0,
  },
];

const SEED_MESSAGES: Record<number, ChatMessage[]> = {
  1: [
    { id: 1, senderId: ME.id, senderName: ME.name, body: "Hi, I submitted a maintenance request for a leaky faucet yesterday. Any update?", time: "9:00 AM", status: "read" },
    { id: 2, senderId: 1, senderName: "Admin Office", body: "Hi Sarah! Yes, we have it on file. Our technician David is assigned and will contact you today between 2–5 PM.", time: "9:15 AM" },
    { id: 3, senderId: ME.id, senderName: ME.name, body: "Perfect! I'll be home during that time. Thank you!", time: "9:16 AM", status: "delivered" },
    { id: 4, senderId: 1, senderName: "Admin Office", body: "Your request has been assigned to the team.", time: "9:18 AM" },
  ],
  2: [
    { id: 1, senderId: 11, senderName: "James Okafor", body: "Hey Sarah! Are you going to the community BBQ on Saturday?", time: "Yesterday" },
    { id: 2, senderId: ME.id, senderName: ME.name, body: "Yes! I'm planning to bring potato salad. What about you?", time: "Yesterday", status: "read" },
    { id: 3, senderId: 11, senderName: "James Okafor", body: "Are you going to the community BBQ?", time: "Yesterday" },
  ],
  3: [
    { id: 1, senderId: 12, senderName: "Lisa Wang", body: "Hi! Are you free this weekend for coffee?", time: "Tuesday" },
    { id: 2, senderId: ME.id, senderName: ME.name, body: "I might be! Saturday afternoon works.", time: "Tuesday", status: "read" },
    { id: 3, senderId: 12, senderName: "Lisa Wang", body: "Let me know when you're free!", time: "Tuesday" },
  ],
  4: [
    { id: 1, senderId: 13, senderName: "Michael Torres", body: "Hi Sarah, your noise report from last Tuesday has been reviewed.", time: "Monday" },
    { id: 2, senderId: 13, senderName: "Michael Torres", body: "Your report has been reviewed.", time: "Monday" },
  ],
};

export default function ResidentMessagesPage() {
  const [conversations, setConversations] = useState<ChatConversation[]>(SEED_CONVS);
  const [messages, setMessages] = useState<Record<number, ChatMessage[]>>(SEED_MESSAGES);
  const [activeId, setActiveId] = useState<number | null>(1);

  const activeMessages = activeId ? (messages[activeId] ?? []) : [];

  const handleSelect = (id: number) => {
    setActiveId(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
  };

  const handleSend = (body: string) => {
    if (!activeId) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newMsg: ChatMessage = {
      id: Date.now(),
      senderId: ME.id,
      senderName: ME.name,
      body,
      time,
      status: "sent",
    };
    setMessages((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? []), newMsg],
    }));
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, lastMessage: body, lastTime: "now" } : c
      )
    );
    toastSuccess("Message sent.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Messages</h1>
          <p className="mt-0.5 text-sm text-slate-500">Chat with admin, moderators, and neighbors.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-medium text-[#0D9488]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14B8A6]"></span>
            {conversations.filter((c) => c.participant.online).length} online
          </span>
        </div>
      </div>

      <ChatShell
        myId={ME.id}
        myName={ME.name}
        accentColor="#14B8A6"
        conversations={conversations}
        messages={activeMessages}
        activeId={activeId}
        onSelect={handleSelect}
        onSend={handleSend}
        searchPlaceholder="Search contacts…"
        emptyText="Select a conversation to start chatting."
      />
    </div>
  );
}
