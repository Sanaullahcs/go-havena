"use client";



import { type ReactNode, useEffect, useState } from "react";

import { AdminBadge } from "@/components/admin/ui";

import type { AdminTone } from "@/lib/admin/admin-tones";

import { categoryLabel, fetchNotice, type EventWaitlistEntry, type Notice } from "@/lib/api/notices";

import EventRsvpPanel from "@/components/admin/event-rsvp-panel";



const STATUS_META: Record<string, { tone: AdminTone; label: string }> = {

  published: { tone: "green", label: "Published" },

  draft: { tone: "amber", label: "Draft" },

  archived: { tone: "slate", label: "Archived" },

};



const CAT_TONE: Record<string, AdminTone> = {

  general: "slate",

  emergency: "red",

  event: "violet",

  maintenance: "amber",

  security: "blue",

  finance: "emerald",

};



function formatSchedule(notice: Notice): string | null {

  if (!notice.event_date && !notice.event_time && !notice.event_time_end) return null;

  const parts: string[] = [];

  const formatDay = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  if (notice.event_date) {
    const start = notice.event_date.slice(0, 10);
    const endRaw = notice.event_end_date ? notice.event_end_date.slice(0, 10) : start;
    if (endRaw !== start) {
      parts.push(`${formatDay(start)} – ${formatDay(endRaw)}`);
    } else {
      parts.push(formatDay(start));
    }
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



function viewEyebrow(category: string): string {

  if (category === "event") return "Event details";

  if (category === "emergency") return "Alert details";

  return "Notice details";

}



function WaitlistSection({ entries }: { entries: EventWaitlistEntry[] }) {

  if (entries.length === 0) {

    return (

      <div className="nl-notice-view-empty">

        No one is on the waiting list yet.

      </div>

    );

  }



  return (

    <div className="nl-notice-view-section">

      <p className="nl-notice-view-section-title">Waiting list ({entries.length})</p>

      <div className="nl-notice-view-list">

        {entries.map((entry) => (

          <div key={entry.id} className="nl-notice-view-list-row">

            <span className="nl-notice-view-avatar nl-notice-view-avatar--sm">#{entry.position}</span>

            {entry.avatar_url ? (

              <img

                src={entry.avatar_url}

                alt=""

                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[#e8edf3]"

              />

            ) : (

              <span className="nl-notice-view-avatar">

                {(entry.name || "?").charAt(0).toUpperCase()}

              </span>

            )}

            <div className="min-w-0 flex-1">

              <p className="truncate text-[13px] font-semibold text-[#0f172a]">{entry.name}</p>

              <p className="text-[11px] text-[#64748b]">Joined {formatJoinedAt(entry.joined_at)}</p>

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

  onNoticeUpdated?: (notice: Notice) => void;

};



export default function NoticeViewModal({ notice, onClose, onEdit, onNoticeUpdated }: Props) {

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

  const catTone = CAT_TONE[detail.category] ?? "slate";

  const schedule = formatSchedule(detail);

  const waitlist = detail.waitlist ?? [];

  const editActionLabel =

    detail.category === "event"

      ? "Edit event"

      : detail.category === "emergency"

        ? "Edit alert"

        : "Edit notice";



  return (

    <div className="nl-notice-modal-backdrop" role="presentation">

      <div className="nl-notice-modal max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="notice-view-title">

        <header className="nl-notice-modal-head">

          <div className="min-w-0 flex-1 overflow-hidden">

            <p className="nl-notice-modal-eyebrow">{viewEyebrow(detail.category)}</p>

            <div className="nl-notice-view-meta mt-1.5">

              <AdminBadge tone={catTone}>{categoryLabel(detail.category)}</AdminBadge>

              <AdminBadge tone={st.tone}>{st.label}</AdminBadge>

              {detail.review_status === "rejected" ? (

                <AdminBadge tone="red">Rejected</AdminBadge>

              ) : detail.review_status === "pending" ? (

                <AdminBadge tone="amber">Pending review</AdminBadge>

              ) : null}

            </div>

            <h3

              id="notice-view-title"

              className="nl-notice-modal-title mt-2 break-words [overflow-wrap:anywhere]"

            >

              {detail.title}

            </h3>

            <p className="nl-notice-view-byline break-words [overflow-wrap:anywhere]">

              By {detail.author_name}

              {detail.published_at

                ? ` · Published ${new Date(detail.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`

                : ""}

            </p>

          </div>

          <button type="button" onClick={onClose} className="nl-notice-modal-close" aria-label="Close">

            <IcoX />

          </button>

        </header>



        <div className="nl-notice-modal-body min-w-0 overflow-x-hidden">

          {detail.review_status === "rejected" && detail.rejection_reason ? (

            <div className="nl-notice-view-reject">

              <p className="nl-notice-view-reject-title">Rejection reason</p>

              <p className="nl-notice-view-reject-body">{detail.rejection_reason}</p>

            </div>

          ) : null}



          {detail.image_url ? (

            <div className="nl-notice-view-image">

              <img src={detail.image_url} alt="" />

            </div>

          ) : null}



          <div className="nl-notice-view-grid">

            {schedule ? (

              <DetailItem icon={<IcoCalendar />} label="Schedule" value={schedule} />

            ) : null}

            {detail.location ? (

              <DetailItem icon={<IcoPin />} label="Location" value={detail.location} />

            ) : null}

            <DetailItem icon={<IcoUsers />} label="Audience" value={formatAudience(detail)} />

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

              <p className="nl-notice-view-section text-[13px] text-[#64748b]">Loading recipients…</p>

            ) : (detail.recipients?.length ?? 0) > 0 ? (

              <div className="nl-notice-view-section">

                <p className="nl-notice-view-section-title">

                  Recipients ({detail.recipients!.length})

                </p>

                <div className="nl-notice-view-list">

                  {detail.recipients!.map((recipient) => (

                    <div key={recipient.id} className="nl-notice-view-list-row">

                      <span className="nl-notice-view-avatar">

                        {(recipient.name || "?").charAt(0).toUpperCase()}

                      </span>

                      <div className="min-w-0 flex-1 overflow-hidden">

                        <p className="truncate text-[13px] font-semibold text-[#0f172a]">{recipient.name}</p>

                        {recipient.unit_number ? (

                          <p className="truncate text-[11px] text-[#64748b]">Unit {recipient.unit_number}</p>

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

              <p className="nl-notice-view-section text-[13px] text-[#64748b]">Loading waiting list…</p>

            ) : (

              <WaitlistSection entries={waitlist} />

            )

          ) : null}



          {detail.category === "event" && !loadingDetail ? (

            <EventRsvpPanel

              notice={detail}

              onUpdated={(updated) => {

                setDetail(updated);

                onNoticeUpdated?.(updated);

              }}

            />

          ) : null}



          <div className="nl-notice-view-section">

            <p className="nl-notice-view-section-title">Description</p>

            <p className="nl-notice-view-body">{detail.body}</p>

          </div>

        </div>



        <footer className="nl-notice-modal-foot">

          <button type="button" onClick={onClose} className="nl-btn-ghost">

            Close

          </button>

          <div className="nl-notice-modal-foot-actions">

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

                {editActionLabel}

              </button>

            ) : null}

          </div>

        </footer>

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

    <div className="nl-notice-view-tile">

      <span className="nl-notice-view-tile-icon">{icon}</span>

      <div className="min-w-0 flex-1 overflow-hidden">

        <p className="nl-notice-view-tile-label">{label}</p>

        <p className="nl-notice-view-tile-value">{value}</p>

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

