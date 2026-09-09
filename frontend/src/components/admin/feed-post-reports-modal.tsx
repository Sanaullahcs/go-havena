"use client";

import { X } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui";
import { postReportStatusLabel, type AdminPost, type AdminPostReport } from "@/lib/api/posts";

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

export function FeedPostReportsModal({
  post,
  reports,
  loading,
  onClose,
}: {
  post: AdminPost | null;
  reports: AdminPostReport[];
  loading?: boolean;
  onClose: () => void;
}) {
  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Reports</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Post by {post.author_name} · #{post.id}
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
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const status = postReportStatusLabel(post);
              if (status === "Sensitive") {
                return <AdminBadge tone="amber">Sensitive</AdminBadge>;
              }
              if (status === "Reported") {
                return <AdminBadge tone="red">Reported</AdminBadge>;
              }
              return <AdminBadge tone="slate">Published</AdminBadge>;
            })()}
            <span className="text-sm font-semibold text-slate-700">
              {reports.length} {reports.length === 1 ? "report" : "reports"}
            </span>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading reports…</p>
          ) : reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No reports submitted for this post or its comments yet.</p>
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
                        {report.comment_id ? "Comment report" : "Post report"}
                      </AdminBadge>
                      <AdminBadge tone={report.source === "admin" ? "amber" : "red"}>
                        {report.source === "admin" ? "Admin report" : "Resident report"}
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
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary w-full justify-center">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
