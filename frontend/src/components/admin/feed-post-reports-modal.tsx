"use client";

import { X } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui";
import { FeedPostStatus } from "@/components/admin/feed-post-status";
import type { AdminPost, AdminPostReport } from "@/lib/api/posts";
import { feedContentTitle, isPollFeedContent } from "@/lib/feed-content-label";

const REPORT_TYPE_LABELS: Record<string, string> = {
  harassment: "Harassment or bullying",
  hate: "Hate or abusive content",
  spam: "Spam or misleading content",
  inappropriate: "Inappropriate or offensive content",
  illegal: "Illegal or unsafe activity",
  privacy: "Privacy concern",
  impersonation: "Impersonation",
  fake_profile: "Fake or misleading profile",
  safety: "Safety concern",
  scam: "Scam or fraud",
  prohibited: "Prohibited or unsafe item",
  incorrect: "Incorrect information",
  damage: "Property damage",
  noise: "Noise or disturbance",
  other: "Other",
};

function reportTypeLabel(type?: string | null) {
  if (!type) return "Other";
  return REPORT_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

function reportStatusLabel(status?: string | null) {
  if (status === "dismissed") return "Dismissed";
  if (status === "resolved") return "Resolved";
  return "Pending review";
}

export function FeedPostReportsModal({
  post,
  reports,
  loading,
  busy,
  onClose,
  onDismiss,
  onMarkSensitive,
  onRemove,
}: {
  post: AdminPost | null;
  reports: AdminPostReport[];
  loading?: boolean;
  busy?: boolean;
  onClose: () => void;
  onDismiss?: (report: AdminPostReport) => void;
  onMarkSensitive?: () => void;
  onRemove?: () => void;
}) {
  if (!post) return null;

  const contentTitle = feedContentTitle(post);
  const isPoll = isPollFeedContent(post);
  const pollQuestion = (post.poll?.question ?? post.body ?? "").trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Reports</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {contentTitle} by {post.author_name} · #{post.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <FeedPostStatus post={post} />
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {isPoll ? pollQuestion : post.body}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {reports.length} {reports.length === 1 ? "report" : "reports"}
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading reports…</p>
          ) : reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No reports submitted for this {contentTitle.toLowerCase()} or its comments yet.
            </p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <article
                  key={report.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{report.reporter_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(report.created_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <AdminBadge tone={report.comment_id ? "cyan" : "slate"}>
                        {report.comment_id
                          ? "Comment report"
                          : (isPoll ? "Poll report" : "Post report")}
                      </AdminBadge>
                      <AdminBadge tone={report.source === "admin" ? "amber" : "red"}>
                        {report.source === "admin" ? "Admin action" : "Resident report"}
                      </AdminBadge>
                      <AdminBadge tone={report.status === "pending_review" || !report.status ? "red" : "slate"}>
                        {reportStatusLabel(report.status)}
                      </AdminBadge>
                    </div>
                  </div>
                  {report.comment_id ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Reported comment
                        {report.comment_author_name ? ` · ${report.comment_author_name}` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {report.comment_body || "Comment unavailable"}
                      </p>
                    </div>
                  ) : null}
                  {report.type ? (
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Reason · {reportTypeLabel(report.type)}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {report.reason}
                  </p>
                  {report.status === "pending_review" || !report.status ? (
                    report.source !== "admin" && onDismiss ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDismiss(report)}
                        className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Dismiss report
                      </button>
                    ) : null
                  ) : report.resolution ? (
                    <p className="mt-2 text-xs text-slate-500">Outcome: {report.resolution.replace(/_/g, " ")}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
          {post.can_mark_sensitive && onMarkSensitive ? (
            <button type="button" disabled={busy} onClick={onMarkSensitive} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50">
              Mark as Sensitive
            </button>
          ) : null}
          {post.can_remove_post && onRemove ? (
            <button type="button" disabled={busy} onClick={onRemove} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {isPoll ? "Remove Poll" : "Remove Post"}
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="nl-btn-secondary justify-center">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
