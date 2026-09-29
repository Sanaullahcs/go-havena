"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AdminBadge } from "@/components/admin/ui";
import { categoryLabel, fetchNotice, type EventWaitlistEntry, type Notice } from "@/lib/api/notices";

const STATUS_META: Record<string, { tone: "green" | "amber" | "blue" | "slate"; label: string }> = {
  published: { tone: "green", label: "Published" },
  draft: { tone: "amber", label: "Draft" },
  archived: { tone: "slate", label: "Archived" },
};

const CAT_COLOR: Record<string, string> = {
  general: "#64748b",
  emergency: "#dc2626",
  event: "#7c3aed",
  maintenance: "#d97706",
  security: "#1B4F8A",
  finance: "#059669",
};

function formatSchedule(notice: Notice): string | null {
  if (!notice.event_date && !notice.event_time && !notice.event_time_end) return null;
  const parts: string[] = [];
  if (notice.event_date) {
    parts.push(
      new Date(notice.event_date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    );
  }
  const formatTime = (time: string) => {
    const [h, m] = time.slice(0, 5).split(":");
    const hour = Number(h);
    const suffix = hour >= 12 ? "PM" : "AM";
    const display = hour % 12 || 12;
    return `${display}:${m} ${suffix}`;
  };
  if (notice.event_time && notice.event_time_end) {
    parts.push(`${formatTime(notice.event_time)} – ${formatTime(notice.event_time_end)}`);
  } else if (notice.event_time) {
    parts.push(formatTime(notice.event_time));
  } else if (notice.event_time_end) {
    parts.push(formatTime(notice.event_time_end));
  }
  return parts.join(" · ");
}

function formatJoinedAt(value: string) {
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatAudience(notice: Notice): string {
  if (notice.audience_type === "selected") {
    const count = notice.recipients?.length ?? notice.recipient_user_ids?.length ?? 0;
    return count > 0
      ? `${count} specific resident${count === 1 ? "" : "s"}`
      : "Specific residents";
  }
  return "All residents";
}

function WaitlistSection({ entries }: { entries: EventWaitlistEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center">
        <p className="text-[13px] font-medium text-slate-600">No one is on the waiting list yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 min-w-0">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        Waiting List ({entries.length})
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className={[
              "flex min-w-0 items-center gap-3 px-4 py-3",
              index > 0 ? "border-t border-slate-100" : "",
            ].join(" ")}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[11px] font-bold text-violet-700">
              #{entry.position}
            </span>
            {entry.avatar_url ? (
              <img
                src={entry.avatar_url}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-600">
                {(entry.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-900">{entry.name}</p>
              <p className="text-[11px] text-slate-500">Joined {formatJoinedAt(entry.joined_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  notice: Notice | null;
  onClose: () => void;
  onEdit?: (notice: Notice) => void;
};

export default function NoticeViewModal({ notice, onClose, onEdit }: Props) {
  const [detail, setDetail] = useState<Notice | null>(notice);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setDetail(notice);
    if (!notice) return;

    const needsDetail =
      notice.category === "event" ||
      (notice.audience_type === "selected" && !(notice.recipients?.length));

    if (!needsDetail) return;

    let cancelled = false;
    setLoadingDetail(true);

    fetchNotice(notice.id)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail(notice);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [notice]);

  if (!notice || !detail) return null;

  const st = STATUS_META[detail.status] ?? STATUS_META.draft;
  const catColor = CAT_COLOR[detail.category] ?? "#64748b";
  const schedule = formatSchedule(detail);
  const waitlist = detail.waitlist ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex h-6 items-center rounded-full px-3 text-[11px] font-semibold text-white"
                  style={{ background: catColor }}
                >
                  {categoryLabel(detail.category)}
                </span>
                <AdminBadge tone={st.tone}>{st.label}</AdminBadge>
                {detail.review_status === "rejected" ? (
                  <AdminBadge tone="red">Rejected</AdminBadge>
                ) : detail.review_status === "pending" ? (
                  <AdminBadge tone="amber">Pending review</AdminBadge>
                ) : null}
              </div>
              <h3 className="mt-2 break-words text-xl font-bold text-slate-900 [overflow-wrap:anywhere]">
                {detail.title}
              </h3>
              <p className="mt-1 break-words text-[13px] text-slate-500 [overflow-wrap:anywhere]">
                By {detail.author_name}
                {detail.published_at
                  ? ` · Published ${new Date(detail.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <IcoX />
            </button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-5">
          {detail.review_status === "rejected" && detail.rejection_reason ? (
            <div className="mb-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">
                Rejection reason
              </p>
              <p className="mt-1 break-words text-sm leading-relaxed text-rose-800 [overflow-wrap:anywhere]">
                {detail.rejection_reason}
              </p>
            </div>
          ) : null}

          {detail.image_url ? (
            <div className="mb-5 flex max-h-80 max-w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
              <img
                src={detail.image_url}
                alt=""
                className="max-h-80 max-w-full object-contain"
              />
            </div>
          ) : null}

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {schedule ? (
              <DetailItem icon={<IcoCalendar />} label="Schedule" value={schedule} />
            ) : null}
            {detail.location ? (
              <DetailItem icon={<IcoPin />} label="Location" value={detail.location} />
            ) : null}
            <DetailItem
              icon={<IcoUsers />}
              label="Audience"
              value={formatAudience(detail)}
            />
            {detail.category === "event" ? (
              <DetailItem
                icon={<IcoUsers />}
                label="Attendance"
                value={
                  detail.event_capacity != null
                    ? `${detail.rsvp_count ?? 0} / ${detail.event_capacity} spots filled${
                        detail.is_full ? " · Full" : ""
                      }${(detail.waitlist_count ?? 0) > 0 ? ` · ${detail.waitlist_count} waiting` : ""}`
                    : `${detail.rsvp_count ?? 0} ${
                        (detail.rsvp_count ?? 0) === 1 ? "person" : "people"
                      } going`
                }
              />
            ) : null}
          </div>

          {detail.audience_type === "selected" ? (
            loadingDetail && !(detail.recipients?.length) ? (
              <p className="mt-5 text-[13px] text-slate-500">Loading recipients…</p>
            ) : (detail.recipients?.length ?? 0) > 0 ? (
              <div className="mt-5 min-w-0">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                  Recipients ({detail.recipients!.length})
                </p>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  {detail.recipients!.map((recipient, index) => (
                    <div
                      key={recipient.id}
                      className={[
                        "flex min-w-0 items-center gap-3 px-4 py-3",
                        index > 0 ? "border-t border-slate-100" : "",
                      ].join(" ")}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[12px] font-semibold text-violet-700">
                        {(recipient.name || "?").charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="truncate text-[13px] font-semibold text-slate-900">{recipient.name}</p>
                        {recipient.unit_number ? (
                          <p className="truncate text-[11px] text-slate-500">Unit {recipient.unit_number}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          ) : null}

          {detail.category === "event" ? (
            loadingDetail ? (
              <p className="mt-5 text-[13px] text-slate-500">Loading waiting list…</p>
            ) : (
              <WaitlistSection entries={waitlist} />
            )
          ) : null}

          <div className="mt-5 min-w-0">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Description</p>
            <p className="max-w-full whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
              {detail.body}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary">
            Close
          </button>
          {onEdit ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(detail);
              }}
              className="nl-btn-primary"
            >
              <IcoPen />
              Edit notice
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
        {icon}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 break-words text-[13px] font-medium text-slate-800 [overflow-wrap:anywhere]">
          {value}
        </p>
      </div>
    </div>
  );
}

function IcoX() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IcoPen() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M13.5 3.5a2 2 0 012.828 2.829L6 16.657l-4 .707.707-4L13.5 3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IcoCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IcoUsers() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 11a2.5 2.5 0 010 5M19 20c0-2.2-1.3-4.1-3-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
