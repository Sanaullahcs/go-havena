"use client";

import {
  resolveAdminNotificationHref,
  type NoticeRoutingHints,
} from "@/lib/notifications/resolve-admin-notification-href";
import { emitForegroundNotification } from "@/lib/notifications/foreground-notification-events";

export type WebPushMessagePayload = {
  id?: string;
  title: string;
  body: string;
  link?: string | null;
  tag?: string | null;
  category?: string | null;
  communityId?: string | null;
  scope?: string | null;
};

export function enrichPushContent(payload: {
  title?: string;
  body?: string;
  kind?: string;
  actor_name?: string;
  actorName?: string;
}): { title: string; body: string } {
  let title = payload.title?.trim() ?? "";
  let body = payload.body?.trim() ?? "";
  const kind = payload.kind ?? "";
  const actor = payload.actor_name ?? payload.actorName ?? "";

  if (!title) {
    if (kind === "post_comment_reply") title = "New reply";
    else if (kind === "post_comment") title = "New comment";
    else if (kind === "message" || kind === "new_message") title = "New message";
    else if (kind === "post_like") title = "New like";
    else if (kind === "post_created") title = "New community post";
    else title = "Havena";
  }

  if (!body) {
    if (kind === "post_comment_reply" && actor) body = `${actor} replied to your comment.`;
    else if (kind === "post_comment" && actor) body = `${actor} commented on your post.`;
    else if ((kind === "message" || kind === "new_message") && actor) body = `${actor} sent you a message.`;
    else if (kind === "post_like" && actor) body = `${actor} liked your post.`;
    else if (kind === "post_created" && actor) body = `${actor} shared a new post in your community.`;
  }

  return { title, body };
}

export function resolvePushLink(link?: string | null, hints?: NoticeRoutingHints): string {
  if (!link?.trim()) return "/admin/notifications";

  const raw = link.trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      return (
        resolveAdminNotificationHref(url.pathname + url.search, undefined, hints) ??
        "/admin/notifications"
      );
    } catch {
      return "/admin/notifications";
    }
  }

  return resolveAdminNotificationHref(raw, undefined, hints) ?? "/admin/notifications";
}

export function buildPushTag(payload: WebPushMessagePayload): string {
  if (payload.tag?.trim()) return payload.tag.trim();
  return "nbr-push";
}

/** In-app card while a dashboard tab is visible. Background banners are shown by the service worker. */
export async function displayForegroundWebPush(
  payload: WebPushMessagePayload,
  onInApp?: (payload: WebPushMessagePayload) => void,
): Promise<void> {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  emitForegroundNotification(payload);
  onInApp?.(payload);
}
