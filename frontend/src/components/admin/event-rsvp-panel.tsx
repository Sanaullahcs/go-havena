"use client";

import { useCallback, useState } from "react";
import { isEventSchedulePast } from "@/lib/admin/event-schedule";
import { rsvpNotice, type Notice } from "@/lib/api/notices";
import { toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";

type Props = {
  notice: Notice;
  onUpdated: (notice: Notice) => void;
};

export default function EventRsvpPanel({ notice, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const requiresRsvp = Boolean(notice.requires_rsvp);
  const isPublished =
    notice.status === "published" && notice.review_status === "approved";
  const ended = isEventSchedulePast(notice);
  const isOrganizer = Boolean(notice.is_organizer);
  const isJoined = Boolean(notice.is_joined);
  const isWaitlisted = Boolean(notice.is_waitlisted);
  const isFull = Boolean(notice.is_full);
  const hasCapacity =
    notice.event_capacity != null && notice.event_capacity > 0;

  const canShow =
    notice.category === "event" && requiresRsvp && isPublished && !ended;

  const runRsvp = useCallback(
    async (status: "going" | "not_going") => {
      setBusy(true);
      try {
        const updated = await rsvpNotice(notice.id, status);
        onUpdated(updated);
        setLeaveConfirm(false);
        if (status === "not_going") {
          toastSuccess("You left this event.");
        } else if (updated.is_waitlisted) {
          toastSuccess("You're on the waiting list.");
        } else {
          toastSuccess("You joined this event.");
        }
      } catch (err) {
        toastError(apiError(err));
      } finally {
        setBusy(false);
      }
    },
    [notice.id, onUpdated],
  );

  if (!canShow) return null;

  if (isOrganizer) {
    return (
      <div className="nl-notice-view-callout">
        <p className="nl-notice-view-callout-title">Your event</p>
        <p className="nl-notice-view-callout-body">
          Organizers cannot RSVP to their own event. Residents can join from the mobile app or
          community notices.
        </p>
      </div>
    );
  }

  const joinLabel = isWaitlisted
    ? "Leave waitlist"
    : isJoined
      ? "Leave event"
      : isFull
        ? "Join waitlist"
        : "Join event";

  const handlePrimary = () => {
    if (isJoined || isWaitlisted) {
      if (!leaveConfirm) {
        setLeaveConfirm(true);
        return;
      }
      void runRsvp("not_going");
      return;
    }
    void runRsvp("going");
  };

  return (
    <div className="nl-notice-view-callout">
      <p className="nl-notice-view-section-title !mb-0">Your RSVP</p>

      {isJoined ? (
        <p className="mt-2 flex items-center gap-2 text-[13px] font-medium text-emerald-800">
          <IcoCheck />
          You&apos;re going
        </p>
      ) : null}

      {isWaitlisted ? (
        <p className="mt-2 text-[13px] font-medium text-[#0a2a43]">
          {notice.waitlist_position
            ? `On the waiting list (#${notice.waitlist_position})`
            : "On the waiting list"}
        </p>
      ) : null}

      {!isJoined && !isWaitlisted && isFull && hasCapacity ? (
        <p className="mt-2 text-[12px] text-slate-600">
          This event is full. You can join the waiting list if a spot opens.
        </p>
      ) : null}

      {leaveConfirm ? (
        <div className="mt-3 rounded-lg border border-rose-100 bg-white px-3 py-3">
          <p className="text-[13px] font-medium text-slate-800">
            {isWaitlisted ? "Leave the waiting list?" : "Leave this event?"}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">
            {isWaitlisted
              ? "You will lose your place in line."
              : "Your spot may go to someone on the waitlist."}
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="nl-btn-secondary !py-2 !text-[13px]"
              disabled={busy}
              onClick={() => setLeaveConfirm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              disabled={busy}
              onClick={() => void runRsvp("not_going")}
            >
              {busy ? "Updating…" : "Leave"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={handlePrimary}
          className={[
            "mt-3 w-full disabled:opacity-60",
            isJoined || isWaitlisted ? "nl-btn-secondary" : "nl-btn-primary",
          ].join(" ")}
        >
          {busy ? "Please wait…" : joinLabel}
        </button>
      )}
    </div>
  );
}

function IcoCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 12l2.5 2.5L16 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
