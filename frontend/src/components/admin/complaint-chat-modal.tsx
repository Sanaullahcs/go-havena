"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Lock, Paperclip, Send, X } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui";
import { toastError } from "@/lib/alert";
import {
  ADMIN_COMPLAINT_SYNC_MS,
  downloadAdminComplaintAttachment,
  fetchAdminComplaint,
  isComplaintNotification,
  postAdminComplaintMessage,
  type ComplaintRecord,
} from "@/lib/api/complaints";
import { apiError } from "@/lib/api/client";
import { getUser } from "@/lib/auth/session";
import { subscribeForegroundNotification } from "@/lib/notifications/foreground-notification-events";

const STATUS_TONE: Record<string, "slate" | "blue" | "cyan" | "amber" | "green" | "violet" | "red"> = {
  submitted: "slate",
  in_review: "blue",
  in_progress: "cyan",
  waiting_on_resident: "amber",
  resolved: "green",
  reopened: "violet",
  closed: "slate",
  cancelled: "red",
};

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function signature(record: ComplaintRecord) {
  return (record.messages ?? []).map((message) => `${message.id}:${message.body}`).join("|");
}

export function ComplaintChatModal({
  detail,
  onBack,
  onSynced,
}: {
  detail: ComplaintRecord;
  onBack: () => void;
  onSynced: (record: ComplaintRecord) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const signatureRef = useRef(signature(detail));
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  const [thread, setThread] = useState<"public" | "internal">("public");
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const meId = getUser()?.id ?? 0;
  const closed = detail.status === "closed" || detail.status === "cancelled";

  const messages = useMemo(() => {
    const rows = detail.messages ?? [];
    return rows.filter((message) => (thread === "internal" ? message.visibility === "internal" : message.visibility !== "internal"));
  }, [detail.messages, thread]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, thread]);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const fresh = await fetchAdminComplaint(detail.id);
        if (cancelled) return;
        const nextSignature = signature(fresh);
        if (nextSignature === signatureRef.current && fresh.status === detail.status) return;
        signatureRef.current = nextSignature;
        onSyncedRef.current(fresh);
      } catch {
        /* keep the open thread */
      }
    };
    const timer = window.setInterval(() => void sync(), ADMIN_COMPLAINT_SYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = subscribeForegroundNotification((payload) => {
      if (isComplaintNotification(payload)) void sync();
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [detail.id, detail.status]);

  const send = async () => {
    const body = draft.trim();
    if (!body && files.length === 0) return;
    setBusy(true);
    try {
      const updated = await postAdminComplaintMessage(detail.id, body || "Attachment added.", thread, files);
      signatureRef.current = signature(updated);
      onSyncedRef.current(updated);
      setDraft("");
      setFiles([]);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (fileId: number, name: string) => {
    try {
      const blob = await downloadAdminComplaintAttachment(detail.id, fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-sm sm:p-6" role="presentation" onClick={onBack}>
      <section
        className="flex h-[min(760px,92vh)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-chat-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
          <button type="button" onClick={onBack} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Back to complaint">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{detail.reference}</p>
              <AdminBadge tone={STATUS_TONE[detail.status] ?? "slate"}>{detail.status_label}</AdminBadge>
            </div>
            <h3 id="complaint-chat-title" className="truncate text-base font-semibold text-slate-900">{detail.title}</h3>
          </div>
          <button type="button" onClick={onBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="Close chat">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex gap-2 border-b border-slate-100 px-4 py-2">
          <ThreadButton label="Resident" active={thread === "public"} onClick={() => setThread("public")} />
          <ThreadButton label="Staff notes" active={thread === "internal"} onClick={() => setThread("internal")} />
        </div>

        <div ref={scrollerRef} className={`min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 ${thread === "internal" ? "bg-[#FFFBF5]" : "bg-[#F6F8FB]"}`}>
          {thread === "internal" ? (
            <p className="mb-2 text-center text-xs font-medium text-amber-800">Only staff can see these notes. Residents are not notified.</p>
          ) : null}
          {messages.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">{thread === "internal" ? "No staff notes yet." : "No messages yet."}</p>
          ) : null}
          {messages.map((message) => {
            const mine = message.sender_id === meId;
            const internal = message.visibility === "internal";
            const attached = (detail.attachments ?? []).filter((file) => file.message_id === message.id);
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  internal
                    ? mine
                      ? "rounded-br-md bg-amber-500 text-white"
                      : "rounded-bl-md border border-amber-200 bg-amber-50 text-amber-950"
                    : mine
                      ? "rounded-br-md bg-[#1B4F8A] text-white"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                }`}>
                  {!mine ? <p className={`text-[11px] font-semibold ${internal ? "text-amber-800" : "text-[#1B4F8A]"}`}>{message.sender_name}</p> : null}
                  <p className="whitespace-pre-wrap leading-5">{message.body}</p>
                  {attached.map((file) => (
                    <button key={file.id} type="button" onClick={() => void openFile(file.id, file.file_name)} className={`mt-1 flex max-w-full items-center gap-1 text-left text-xs font-semibold underline ${mine && !internal ? "text-white" : "text-[#1B4F8A]"}`}>
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="truncate">{file.file_name}</span>
                    </button>
                  ))}
                  <p className={`mt-1 text-right text-[10px] ${mine && !internal ? "text-white/75" : "text-slate-400"}`}>{formatTime(message.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {closed ? (
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <Lock className="h-4 w-4" />
            This complaint is {detail.status_label.toLowerCase()}.
          </div>
        ) : (
          <form
            className={`border-t border-slate-100 px-3 py-3 ${thread === "internal" ? "bg-[#FFFBF5]" : "bg-white"}`}
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {files.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((file) => (
                  <button key={`${file.name}-${file.size}`} type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {file.name} ×
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#1B4F8A] hover:bg-slate-100" aria-label="Attach a file">
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  setFiles((current) => [...current, ...picked].slice(0, 5));
                  event.target.value = "";
                }}
              />
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={thread === "internal" ? "Private note for staff" : "Write a message"}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-full border border-slate-200 bg-[#F4F7FB] px-4 py-2.5 text-sm outline-none focus:border-[#1B4F8A]"
              />
              <button type="submit" disabled={busy || (!draft.trim() && files.length === 0)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B4F8A] text-white disabled:opacity-40" aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function ThreadButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${active ? "bg-[#1B4F8A] text-white" : "bg-slate-100 text-slate-600"}`}>
      {label}
    </button>
  );
}
