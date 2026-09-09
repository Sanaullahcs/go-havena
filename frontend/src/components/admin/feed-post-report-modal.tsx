"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Send, X } from "lucide-react";
import type { AdminPost } from "@/lib/api/posts";
import { NL } from "@/lib/design-tokens";

const REPORT_TYPES = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate or abusive content" },
  { value: "spam", label: "Spam or misleading content" },
  { value: "inappropriate", label: "Inappropriate or offensive content" },
  { value: "illegal", label: "Illegal or unsafe activity" },
  { value: "privacy", label: "Privacy concern" },
  { value: "other", label: "Other" },
] as const;

export type FeedPostReportPayload = {
  type: string;
  reason: string;
};

export function FeedPostReportModal({
  post,
  busy,
  onClose,
  onSubmit,
}: {
  post: AdminPost | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: FeedPostReportPayload) => void | Promise<void>;
}) {
  const [type, setType] = useState<string>("harassment");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!post) return;
    setType("harassment");
    setDescription("");
  }, [post?.id]);

  const trimmed = description.trim();
  const canSubmit = useMemo(() => trimmed.length >= 8 && !busy, [trimmed, busy]);

  if (!post) return null;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({ type, reason: trimmed });
    setDescription("");
    setType("spam");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Flag className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] font-bold text-slate-900">Report post</h3>
            <p className="mt-1 text-[13px] leading-5 text-slate-500">
              Tell why this post from {post.author_name} should be marked as sensitive for mobile users.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
            disabled={busy}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 pb-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">Reason</p>
            <div className="flex flex-wrap gap-2">
              {REPORT_TYPES.map((option) => {
                const active = type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={busy}
                    onClick={() => setType(option.value)}
                    className={[
                      "rounded-full border px-3 py-2 text-xs font-medium transition",
                      active
                        ? "border-teal-500 bg-teal-50 text-teal-800"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300",
                      busy ? "cursor-not-allowed opacity-60" : "",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="report-details" className="mb-2 block text-xs font-semibold text-slate-600">
              Details
            </label>
            <textarea
              id="report-details"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={500}
              disabled={busy}
              placeholder="Describe what happened or why this post is inappropriate..."
              className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100 disabled:opacity-60"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              {trimmed.length}/500 · minimum 8 characters
            </p>
          </div>
        </div>

        <div className="flex gap-2.5 px-5 pb-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-sm font-semibold text-slate-500 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl px-3 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-55"
            style={{ background: NL.fillCta }}
          >
            {busy ? (
              "Submitting…"
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
