"use client";

import { useState, useRef, useEffect } from "react";
import { UserAvatar } from "@/components/admin/user-avatar";

/* ─── Types ─── */
export type ChatParticipant = {
  id: number;
  name: string;
  role: string;
  online?: boolean;
  avatar?: string;
  lastSeen?: string;
};

export type ChatConversation = {
  id: number;
  participant: ChatParticipant;
  lastMessage: string;
  lastTime: string;
  unread: number;
};

export type ChatMessage = {
  id: number;
  senderId: number;
  senderName: string;
  body: string;
  time: string;
  status?: "sent" | "delivered" | "read";
};

/* ─── Shared Chat Shell (works for admin + resident) ─── */
export function ChatShell({
  myId,
  myName,
  accentColor = "#1B4F8A",
  conversations,
  messages,
  activeId,
  onSelect,
  onSend,
  searchPlaceholder = "Search conversations…",
  emptyText = "Select a conversation to start messaging.",
  emptyListText,
  loadingList = false,
  loadingThread = false,
  sending = false,
  threadSubtitle,
  hideHeaderActions = false,
  onClose,
}: {
  myId: number;
  myName: string;
  accentColor?: string;
  conversations: ChatConversation[];
  messages: ChatMessage[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onSend: (body: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  emptyListText?: string;
  loadingList?: boolean;
  loadingThread?: boolean;
  sending?: boolean;
  threadSubtitle?: string | null;
  hideHeaderActions?: boolean;
  onClose?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filtered = conversations.filter((c) =>
    !search || c.participant.name.toLowerCase().includes(search.toLowerCase())
  );

  const active = conversations.find((c) => c.id === activeId);

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft("");
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-130px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* ── Sidebar ── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-slate-100">
        {/* Search */}
        <div className="border-b border-slate-100 p-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <IcoSearch />
            </span>
            <input
              type="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-3 text-[12.5px] outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
              style={{ paddingLeft: "1.875rem" }}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <p className="p-4 text-center text-[12.5px] text-slate-400">Loading conversations…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-center text-[12.5px] text-slate-400">
              {emptyListText ?? "No conversations found."}
            </p>
          ) : (
            filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={[
                "group flex w-full items-center gap-2.5 border-b border-slate-100/80 px-3 py-3 text-left transition",
                activeId === c.id
                  ? "bg-blue-50/70"
                  : "hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="relative shrink-0">
                <Avatar name={c.participant.name} src={c.participant.avatar} color={accentColor} size={36} />
                {c.participant.online && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#14B8A6]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-[13px] font-semibold text-slate-900">{c.participant.name}</p>
                  <span className="shrink-0 text-[11px] text-slate-400">{c.lastTime}</span>
                </div>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <p className="truncate text-[12px] text-slate-500">{c.lastMessage || "No messages yet"}</p>
                  {c.unread > 0 && (
                    <span className="flex h-4.5 min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10.5px] font-bold text-white leading-none" style={{ background: accentColor }}>
                      {c.unread}
                    </span>
                  )}
                </div>
                {c.participant.role !== "Resident" ? (
                  <p className="mt-0.5 text-[11px] text-slate-400">{c.participant.role}</p>
                ) : null}
              </div>
            </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Message thread ── */}
      {activeId && active ? (
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="relative">
              <Avatar name={active.participant.name} src={active.participant.avatar} color={accentColor} size={36} />
              {active.participant.online && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#14B8A6]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 text-[14px]">{active.participant.name}</p>
              <p className="text-[12px] text-slate-400">
                {threadSubtitle || active.participant.role}
              </p>
            </div>
            {onClose || !hideHeaderActions ? (
              <div className="flex items-center gap-1">
                {!hideHeaderActions ? (
                  <>
                    <HeaderBtn title="Call"><IcoPhone /></HeaderBtn>
                    <HeaderBtn title="Info"><IcoInfo /></HeaderBtn>
                  </>
                ) : null}
                {onClose ? (
                  <HeaderBtn title="Close conversation" onClick={onClose}>
                    <IcoClose />
                  </HeaderBtn>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-slate-50/40 p-4 space-y-3">
            {loadingThread ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-[13px] text-slate-400">Loading messages…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <IcoMsg />
                </div>
                <p className="text-[13px] text-slate-400">No messages yet. Say hello!</p>
              </div>
            ) : (
              messages.map((msg) => {
              const isMine = msg.senderId === myId;
              return (
                <div key={msg.id} className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                  {!isMine && <Avatar name={msg.senderName} src={active?.participant.avatar} color={accentColor} size={28} />}
                  <div className={`max-w-[72%] space-y-1 ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                    {!isMine && (
                      <p className="px-1 text-[11px] font-semibold text-slate-500">{msg.senderName}</p>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-[13.5px] leading-snug shadow-sm ${
                        isMine
                          ? "rounded-br-sm text-white"
                          : "rounded-bl-sm bg-white text-slate-800 border border-slate-200/80"
                      }`}
                      style={isMine ? { background: accentColor } : undefined}
                    >
                      {msg.body}
                    </div>
                    <div className={`flex items-center gap-1 px-1 ${isMine ? "flex-row-reverse" : ""}`}>
                      <span className="text-[10.5px] text-slate-400">{msg.time}</span>
                      {isMine && msg.status && (
                        <span className="text-slate-400 [&_svg]:h-3 [&_svg]:w-3">
                          {msg.status === "read" ? <IcoDoubleCheck /> : msg.status === "delivered" ? <IcoDoubleCheck /> : <IcoCheck />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-slate-100 bg-white p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a message… (Enter to send)"
                  className="w-full resize-none bg-transparent text-[13.5px] text-slate-800 outline-none placeholder:text-slate-400"
                  style={{ maxHeight: "6rem" }}
                />
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4"
                style={{ background: accentColor }}
              >
                <IcoSend />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {sending ? "Sending…" : "Shift+Enter for new line"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50/30">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 [&_svg]:h-7 [&_svg]:w-7">
            <IcoMsg />
          </div>
          <p className="text-[13.5px] font-medium text-slate-500">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */
function Avatar({
  name,
  src,
  color,
  size,
}: {
  name: string;
  src?: string;
  color: string;
  size: number;
}) {
  return <UserAvatar name={name} src={src} size={size} color={color} />;
}

function HeaderBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 [&_svg]:h-4 [&_svg]:w-4"
    >
      {children}
    </button>
  );
}

function IcoSearch()      { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IcoCheck()       { return <svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoDoubleCheck() { return <svg viewBox="0 0 16 12" fill="none"><path d="M1 6l3.5 3.5L11 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 9.5L12.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoSend()   { return <svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoMsg()    { return <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>; }
function IcoPhone()  { return <svg viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 012 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function IcoInfo()   { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function IcoClose()  { return <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
