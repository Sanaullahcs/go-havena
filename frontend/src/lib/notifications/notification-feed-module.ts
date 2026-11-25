import type { AppNotification } from "@/components/shared/notification-bell";

export type NotificationFeedModule = "events" | "notices" | "amenities" | "others";

export type NotificationModuleCounts = Partial<Record<NotificationFeedModule, number>>;

export function classifyNotificationModule(note: AppNotification): NotificationFeedModule | null {
  const title = (note.title ?? "").toLowerCase();
  const body = (note.body ?? "").toLowerCase();
  const url = (note.actionUrl ?? "").toLowerCase();
  const category = (note.noticeCategory ?? "").toLowerCase();

  if (
    category === "event"
    || title === "new event"
    || title === "event update"
    || title === "event cancelled"
    || body.includes("your event")
    || body.includes("joined the waiting list")
    || url.includes("/admin/events")
    || (url.includes("/notices/") && category === "event")
  ) {
    return "events";
  }

  if (
    title === "new notice"
    || (url.includes("/notices/") && category !== "event" && category !== "emergency")
  ) {
    return "notices";
  }

  if (
    url.includes("amenit")
    || url.includes("booking")
    || title.includes("amenity")
    || title.includes("reservation")
    || title.includes("booking")
    || body.includes("booking for ")
    || body.includes("your booking for ")
  ) {
    return "amenities";
  }

  if (
    url.includes("/admin/members")
    || url.includes("/admin/guests")
    || url.includes("/admin/residents")
    || url.includes("/admin/community-admins")
    || title.includes("membership")
    || title.includes("guest")
    || title.includes("member")
    || title.includes("community admin")
    || title.includes("community invitation")
    || body.includes("guest access")
    || body.includes("membership")
  ) {
    return "others";
  }

  return null;
}

export function filterNotificationsByModule(
  notes: AppNotification[],
  module: NotificationFeedModule,
): AppNotification[] {
  return notes.filter((note) => classifyNotificationModule(note) === module);
}

export function countNotificationsByModule(notes: AppNotification[]): NotificationModuleCounts {
  const counts: NotificationModuleCounts = {
    events: 0,
    notices: 0,
    amenities: 0,
    others: 0,
  };

  for (const note of notes) {
    const module = classifyNotificationModule(note);
    if (module) counts[module] = (counts[module] ?? 0) + 1;
  }

  return counts;
}
