"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { UserAvatar } from "@/components/admin/user-avatar";
import { fetchMessageableMembers, type CommunityMember } from "@/lib/api/messages";
import { apiError } from "@/lib/api/client";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (member: CommunityMember) => void;
};

export function AdminNewChatSheet({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMessageableMembers(search)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, search]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 z-0 nl-modal-backdrop bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-modal-in"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-new-chat-title"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id="admin-new-chat-title" className="text-base font-bold text-slate-900">
              New message
            </h3>
            <p className="text-xs text-slate-500">Choose a resident to chat with</p>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="relative z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </header>

        <div className="border-b border-slate-100 p-3">
          <ClearableInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or unit…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            autoFocus
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400">Loading…</p>
          ) : error ? (
            <p className="p-6 text-center text-sm text-red-600">{error}</p>
          ) : members.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">No residents found.</p>
          ) : (
            members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelect(member)}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
              >
                <UserAvatar name={member.name} src={member.avatar_url} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{member.name}</span>
                  {member.unit ? (
                    <span className="block truncate text-xs text-slate-500">Unit {member.unit}</span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
