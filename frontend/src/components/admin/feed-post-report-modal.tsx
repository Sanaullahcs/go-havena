"use client";

import { ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useState } from "react";
import { Flag, Send, X } from "lucide-react";
import type { AdminPost } from "@/lib/api/posts";
import { feedContentTitle } from "@/lib/feed-content-label";
import { NL } from "@/lib/design-tokens";

const REPORT_DETAILS_MIN = 8;
const REPORT_DETAILS_MAX = 500;

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
  const [type, setType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [detailsTouched, setDetailsTouched] = useState(false);

  useEffect(() => {
    if (!post) return;
    setType("");
    setDescription("");
    setDetailsTouched(false);
  }, [post?.id]);

  const trimmed = description.trim();
  const detailsRequired = type === "other";
  const detailsValid = !detailsRequired || trimmed.length >= REPORT_DETAILS_MIN;
  const detailsShowError = detailsRequired && detailsTouched && trimmed.length > 0 && trimmed.length < REPORT_DETAILS_MIN;
  const detailsShowHint = detailsRequired && detailsTouched && trimmed.length === 0;
  const canSubmit = useMemo(() => {
    if (!type || busy) return false;
    if (detailsRequired) return trimmed.length >= REPORT_DETAILS_MIN;
    return true;
  }, [busy, detailsRequired, trimmed.length, type]);

  const selectType = (value: string) => {
    setType(value);
    setDetailsTouched(false);
    if (value !== "other") setDescription("");
  };

  if (!post) return null;

  const contentTitle = feedContentTitle(post);
  const contentKind = contentTitle.toLowerCase();

  const handleSubmit = async () => {
    if (detailsRequired && trimmed.length < REPORT_DETAILS_MIN) {
      setDetailsTouched(true);
      return;
    }
    if (!canSubmit) return;
    const label = REPORT_TYPES.find((o) => o.value === type)?.label ?? type;
    const reason = type === "other" ? trimmed : label;
    await onSubmit({ type, reason });
    setDescription("");
    setType("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

        <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Flag className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] font-bold text-slate-900">Mark as Sensitive</h3>
            <p className="mt-1 text-[13px] leading-5 text-slate-500">
              Flag {post.author_name}&apos;s {contentKind} as sensitive for resident app users immediately. Resident reports only auto-hide content after 3 user reports.
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-2">
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
                    onClick={() => selectType(option.value)}
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

          {detailsRequired ? (
            <div>
              <label htmlFor="report-details" className="mb-2 block text-xs font-semibold text-slate-600">
                Details <span className="text-red-500" aria-hidden>*</span>
                <span className="sr-only"> (required)</span>
              </label>
              <ClearableTextarea
                id="report-details"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setDetailsTouched(true);
                }}
                onBlur={() => setDetailsTouched(true)}
                rows={4}
                maxLength={REPORT_DETAILS_MAX}
                disabled={busy}
                aria-invalid={detailsShowError || detailsShowHint}
                placeholder={`Describe what happened or why this ${contentKind} is inappropriate...`}
                className={[
                  "min-h-[96px] max-h-[min(10.5rem,28vh)] w-full resize-none overflow-y-auto rounded-xl border bg-slate-50 px-3.5 py-3 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:bg-white disabled:opacity-60",
                  detailsShowError || detailsShowHint
                    ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    : detailsValid && trimmed.length >= REPORT_DETAILS_MIN
                      ? "border-emerald-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                      : "border-slate-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100",
                ].join(" ")}
              />
              {detailsShowError ? (
                <p className="mt-1.5 text-[11px] font-medium text-red-600" role="alert">
                  Add at least {REPORT_DETAILS_MIN - trimmed.length} more character
                  {REPORT_DETAILS_MIN - trimmed.length === 1 ? "" : "s"} ({trimmed.length}/{REPORT_DETAILS_MIN} minimum).
                </p>
              ) : detailsShowHint ? (
                <p className="mt-1.5 text-[11px] font-medium text-red-600" role="alert">
                  Details are required when you choose Other (minimum {REPORT_DETAILS_MIN} characters).
                </p>
              ) : trimmed.length >= REPORT_DETAILS_MIN ? (
                <p className="mt-1.5 text-[11px] font-medium text-emerald-600">
                  Looks good · {trimmed.length}/{REPORT_DETAILS_MAX}
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Required · {trimmed.length}/{REPORT_DETAILS_MAX} · minimum {REPORT_DETAILS_MIN} characters
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2.5 px-5 pb-5 pt-3">
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
              "Marking…"
            ) : (
              <>
                <Send className="h-4 w-4" />
                Mark as Sensitive
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
