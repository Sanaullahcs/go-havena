import { Linking } from "react-native";
import { apiRequest } from "./api-client";
import { getCachedUser, getCommunityId } from "./auth-session";
import { switchActiveCommunity } from "./profile-api";
import { isCommunityAdmin } from "./community-access";
import { fetchAgreementDetail, fetchSignedAgreementLink } from "./documents-api";
import { parseApiDate } from "../utils/parse-api-date";
import { getNoticeDetailRoute } from "./notices-api";
import { getNotificationIconSource } from "../utils/notification-visual";
import i18n from "../i18n";
import { getLocaleForLang } from "../hooks/use-app-locale";

export function getNotificationIcon(raw) {
  return getNotificationIconSource(raw);
}

/** Screens registered in app/_layout — unknown /screens paths must not passthrough. */
const ALLOWED_SCREEN_PREFIXES = [
  "/screens/admin-amenities",
  "/screens/admin-amenity-bills",
  "/screens/admin-bookings",
  "/screens/admin-complaints",
  "/screens/complaints",
  "/screens/admin-service-bills",
  "/screens/admin-content-review",
  "/screens/admin-dashboard",
  "/screens/admin-guests",
  "/screens/admin-listings",
  "/screens/admin-members",
  "/screens/admin-units",
  "/screens/community-feed",
  "/screens/community-listings",
  "/screens/event-detail",
  "/screens/guest-approvals",
  "/screens/invite-code",
  "/screens/listing-detail",
  "/screens/marketplace-listings",
  "/screens/messages",
  "/screens/notice-detail",
  "/screens/notification",
  "/screens/pending-community",
  "/screens/pending-community-admin",
  "/screens/property-management",
  "/(tabs)/services",
  "/screens/profile",
];

const ALLOWED_TAB_PATHS = new Set([
  "/(tabs)/home",
  "/(tabs)/notices",
  "/(tabs)/marketplace",
  "/(tabs)/wellness",
  "/(tabs)/profile",
  "/(tabs)/services",
]);

function parseQueryString(queryString) {
  const params = {};
  if (!queryString) return params;

  String(queryString)
    .split("&")
    .filter(Boolean)
    .forEach((pair) => {
      const [rawKey, rawValue = ""] = pair.split("=");
      const key = decodeURIComponent(rawKey ?? "");
      if (!key) return;
      params[key] = decodeURIComponent(rawValue);
    });

  return params;
}

function parseNotificationData(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

function isAllowedMobilePath(pathname) {
  if (!pathname) return false;
  if (ALLOWED_TAB_PATHS.has(pathname)) return true;
  return ALLOWED_SCREEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function withParams(pathname, queryParams = {}) {
  const entries = Object.entries(queryParams).filter(([, value]) => value != null && value !== "");
  if (entries.length === 0) return { pathname };
  return {
    pathname,
    params: Object.fromEntries(entries.map(([key, value]) => [key, String(value)])),
  };
}

function agreementDetailRoute(documentId) {
  if (documentId == null || documentId === "") return null;
  return withParams("/screens/property-management/documents/document-detail", {
    documentId,
  });
}

function agreementDocumentId(notification, queryParams = {}) {
  return (
    queryParams.agreement
    ?? queryParams.documentId
    ?? queryParams.document_id
    ?? notification?.documentId
    ?? null
  );
}

function resolveAgreementRoute(notification, pathname = "", queryParams = {}) {
  const path = String(pathname).toLowerCase();
  const kind = String(notification?.kind ?? notification?.type ?? "").toLowerCase();
  const haystack = `${notification?.title ?? ""} ${notification?.description ?? ""}`.toLowerCase();
  const isAgreement =
    kind === "agreement"
    || path.includes("/admin/documents")
    || path.includes("/documents/document-detail")
    || haystack.includes("agreement");
  if (!isAgreement) return null;
  return agreementDetailRoute(agreementDocumentId(notification, queryParams));
}

function resolveAdminPendingRoute(pathname, queryParams, notification) {
  const path = String(pathname ?? "").toLowerCase();
  const haystack = `${notification?.title ?? ""} ${notification?.description ?? ""}`.toLowerCase();

  if (path.includes("/admin/events") || path.includes("kind=event") || /\bevent\b/.test(haystack)) {
    return withParams("/screens/admin-content-review", { kind: "event" });
  }
  if (path.includes("/admin/alerts") || path.includes("kind=alert") || /\balert\b|\bemergency\b/.test(haystack)) {
    return withParams("/screens/admin-content-review", { kind: "alert" });
  }
  if (path.includes("/admin/notices") || path.includes("kind=notice") || path.includes("review_status=pending")) {
    return withParams("/screens/admin-content-review", { kind: "notice" });
  }
  return null;
}

function isMissingBillingContactNotification(notification) {
  const kind = String(notification?.kind ?? "").toLowerCase();
  const haystack = `${notification?.title ?? ""} ${notification?.description ?? ""}`.toLowerCase();
  return kind === "unit_missing_billing_contact" || haystack.includes("has no billing contact");
}

function adminUnitsRoute(notification, extraParams = {}) {
  return withParams("/screens/admin-units", {
    unitId: extraParams.unitId ?? notification?.unitId ?? "",
    unitNumber: extraParams.unitNumber ?? notification?.unitNumber ?? "",
  });
}

function isInformationalOnlyNotification(notification) {
  const haystack = `${notification?.title ?? ""} ${notification?.description ?? ""}`.toLowerCase();
  return haystack.includes("community invitation");
}

function resolveNotificationRouteFallback(notification) {
  const title = String(notification?.title ?? "").toLowerCase();
  const body = String(notification?.description ?? "").toLowerCase();
  const haystack = `${title} ${body}`;

  if (
    haystack.includes("pending approval") ||
    (haystack.includes("submitted") && haystack.includes("for review"))
  ) {
    if (/\bevent\b/.test(haystack)) {
      return withParams("/screens/admin-content-review", { kind: "event" });
    }
    if (/\balert\b|\bemergency\b/.test(haystack)) {
      return withParams("/screens/admin-content-review", { kind: "alert" });
    }
    return withParams("/screens/admin-content-review", { kind: "notice" });
  }

  if (haystack.includes("amenity") || haystack.includes("reservation") || haystack.includes("booking request")) {
    if (
      haystack.includes("booking request")
      || haystack.includes("reservation requested")
      || (haystack.includes("requested") && haystack.includes("amenity") && !haystack.includes("needs approval"))
    ) {
      return { pathname: "/screens/admin-bookings" };
    }
    if (haystack.includes("payment proof") || haystack.includes("amenity payment")) {
      return { pathname: "/screens/property-management/amenity-bills" };
    }
    if (haystack.includes("approved") || haystack.includes("declined")) {
      return { pathname: "/(tabs)/services/my-booking" };
    }
    if (haystack.includes("needs approval") || haystack.includes("new amenity")) {
      return { pathname: "/screens/admin-amenities" };
    }
    return { pathname: "/screens/admin-bookings" };
  }

  if (haystack.includes("guest approval") || haystack.includes("approve or reject guest")) {
    return { pathname: "/screens/guest-approvals" };
  }

  if (isMissingBillingContactNotification(notification)) {
    return adminUnitsRoute(notification);
  }

  if (haystack.includes("billing contact")) {
    return { pathname: "/screens/property-management/billing-contact" };
  }

  if (
    haystack.includes("new service available")
    || haystack.includes("open available services")
    || haystack.includes("now available for your unit")
  ) {
    return { pathname: "/screens/property-management/available-services" };
  }

  if (
    haystack.includes("amenity bill")
    || (haystack.includes("amenity") && haystack.includes("bill"))
  ) {
    if (haystack.includes("pending verification") || haystack.includes("payment proof submitted")) {
      return { pathname: "/screens/admin-amenity-bills" };
    }
    const amenityId = notification?.data?.amenity_id ?? notification?.payload?.amenity_id;
    if (amenityId) {
      return {
        pathname: "/screens/property-management/amenity/all-facilities",
        params: { id: String(amenityId) },
      };
    }
    return { pathname: "/screens/property-management/amenity" };
  }

  if (
    haystack.includes("new service bill")
    || haystack.includes("new service")
    || haystack.includes("bill is now available")
    || haystack.includes("service bill due")
    || haystack.includes("payment proof")
    || haystack.includes("payment approved")
  ) {
    return { pathname: "/screens/property-management/unit-bills" };
  }

  if (haystack.includes("new message") || haystack.includes("new offer") || haystack.includes("offer received") || haystack.includes("sent you a message")) {
    return { pathname: "/screens/messages" };
  }

  if (haystack.includes("listing approved") || haystack.includes("listing rejected")) {
    return { pathname: "/screens/community-listings", params: { mine: "1" } };
  }

  if (haystack.includes("post approved") || haystack.includes("post not approved") || haystack.includes("content approved") || haystack.includes("content re-approved")) {
    if (/\bevent\b/.test(haystack)) {
      return { pathname: "/(tabs)/notices" };
    }
    if (haystack.includes("post")) {
      return { pathname: "/screens/community-feed" };
    }
    return { pathname: "/(tabs)/notices" };
  }

  if (haystack.includes("liked your post") || haystack.includes("commented on your post")) {
    return { pathname: "/screens/community-feed" };
  }

  if (haystack.includes("membership request declined") || haystack.includes("pending community")) {
    return { pathname: "/screens/pending-community" };
  }

  if (haystack.includes("membership approved")) {
    return { pathname: "/screens/pending-community" };
  }

  const agreementRoute = resolveAgreementRoute(notification);
  if (agreementRoute) return agreementRoute;

  if (haystack.includes("seat available") || haystack.includes("waiting list")) {
    const noticeId = String(notification?.actionUrl ?? "").match(/\/notices\/(\d+)/)?.[1];
    if (noticeId) {
      return getNoticeDetailRoute({ id: noticeId, category: "event" });
    }
  }

  return null;
}

export function formatNotificationTime(dateStr) {
  if (!dateStr) return "";
  try {
    const date = parseApiDate(dateStr);
    if (!date) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 60_000) return i18n.t("time.justNow");
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return i18n.t("time.justNow");
    if (diffMins < 60) return i18n.t("time.minutesAgo", { count: diffMins });
    if (diffHours < 24) return i18n.t("time.hoursAgo", { count: diffHours });
    if (diffDays === 1) return i18n.t("time.daysAgo", { count: 1 });
    if (diffDays < 7) return i18n.t("time.daysAgo", { count: diffDays });

    return date.toLocaleDateString(getLocaleForLang(i18n.language), {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateStr;
  }
}

export function normalizeNotification(raw) {
  if (!raw) return null;

  const data = parseNotificationData(raw.data);
  let kind = raw.kind ?? data?.kind ?? null;
  if (!kind && String(raw.type ?? "").toLowerCase() === "agreement") {
    kind = "agreement";
  }
  const category = raw.category ?? raw.notice_category ?? data?.category ?? null;

  const normalized = {
    id: raw.id,
    type: raw.type ?? "info",
    title: raw.title ?? "",
    description: raw.body ?? "",
    time: formatNotificationTime(raw.created_at),
    read: Boolean(raw.read_at),
    actionUrl: raw.action_url ?? null,
    createdAt: raw.created_at,
    kind,
    category,
    unitId: data?.unit_id ?? raw.unit_id ?? null,
    unitNumber: data?.unit_number ?? raw.unit_number ?? null,
    documentId: data?.document_id ?? data?.documentId ?? data?.agreement ?? null,
    communityId: data?.community_id ?? data?.communityId ?? raw.community_id ?? null,
    complaintId: data?.complaint_id ?? data?.complaintId ?? null,
    audience: data?.audience ?? null,
    assignmentId: data?.assignment_id ?? data?.assignmentId ?? null,
    openSignedPdf: data?.open_signed === true || data?.open_signed === 1 || data?.open_signed === "1" || data?.open_signed === "true",
  };

  normalized.icon = getNotificationIcon(normalized);

  return normalized;
}

export function sortNotifications(notifications) {
  return [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function isAdminAgreementSignedNotification(notification) {
  if (notification?.openSignedPdf === true) return true;
  return String(notification?.title ?? "").trim().toLowerCase() === "agreement signed";
}

function notificationDocumentId(notification) {
  if (notification?.documentId) return notification.documentId;
  const query = String(notification?.actionUrl ?? "").split("?")[1] ?? "";
  const params = parseQueryString(query);
  return params.agreement || params.documentId || params.document_id || null;
}

function signedRecipientForNotification(recipients, notification) {
  const signed = (recipients ?? []).filter(
    (row) => row?.signature_status === "signed" && row?.signed_file_url,
  );
  if (signed.length === 0) return null;
  if (notification?.assignmentId) {
    const exact = signed.find((row) => String(row.id) === String(notification.assignmentId));
    if (exact) return exact;
  }
  const body = String(notification?.description ?? "").trim();
  const match = body.match(/^(.*?) signed (.*)\.?$/i);
  const name = match?.[1]?.trim().toLowerCase();
  if (name) {
    const named = signed.filter(
      (row) => String(row.resident_name ?? "").trim().toLowerCase() === name,
    );
    if (named.length > 0) {
      return named.sort((a, b) => String(b.signed_at ?? "").localeCompare(String(a.signed_at ?? "")))[0];
    }
  }
  return signed.length === 1 ? signed[0] : null;
}

/** Open the resident's stamped PDF for an admin Agreement Signed notification. */
export async function openAdminSignedAgreement(notification) {
  const documentId = notificationDocumentId(notification);
  if (!documentId) return false;
  if (notification?.assignmentId) {
    try {
      const url = await fetchSignedAgreementLink(documentId, notification.assignmentId);
      if (url) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      // Older rows can be resolved from the agreement's signed recipients.
    }
  }
  const detail = await fetchAgreementDetail(documentId);
  const recipient = signedRecipientForNotification(detail?.recipients, notification);
  if (!recipient?.signed_file_url) return false;
  await Linking.openURL(recipient.signed_file_url);
  return true;
}

/** Map backend action_url to an in-app route. Returns null when no safe destination exists. */
/** Align resident API scope before opening a community-scoped notification (documents, agreements, etc.). */
export async function ensureNotificationCommunityContext(notification) {
  const target = notification?.communityId ?? notification?.community_id;
  if (target == null || target === "") return;

  const current = await getCommunityId();
  if (current != null && String(current) === String(target)) return;

  try {
    await switchActiveCommunity(Number(target));
  } catch {
    // Navigation still proceeds; resident endpoints fall back to active_context on the server.
  }
}

export function resolveNotificationRoute(notification) {
  if (isInformationalOnlyNotification(notification)) {
    return null;
  }

  const actionUrl = notification?.actionUrl;
  if (!actionUrl) {
    return resolveNotificationRouteFallback(notification);
  }

  const url = String(actionUrl).trim();
  const [pathname, queryString = ""] = url.split("?");
  const queryParams = parseQueryString(queryString);

  const agreementRoute = resolveAgreementRoute(notification, pathname, queryParams);
  if (agreementRoute) return agreementRoute;

  const complaintId = queryParams.complaint || queryParams.id || notification?.complaintId;
  if (pathname.includes("/screens/staff-tasks") || notification?.audience === "staff") {
    if (!complaintId) return withParams("/screens/staff-tasks", {});
    return withParams("/screens/staff-tasks/detail", {
      id: String(complaintId),
      ...(queryParams.chat === "1" ? { chat: "1" } : {}),
    });
  }
  const complaintUrl = url.includes("support-complaints") || url.includes("/complaints") || notification?.kind === "complaint";
  if (complaintUrl && complaintId) {
    const wantsAdmin = notification?.audience === "admin" || pathname.startsWith("/admin/");
    const managing = isCommunityAdmin(getCachedUser());
    const openChat = queryParams.chat === "1" || pathname.includes("/chat");
    if (wantsAdmin) {
      return managing
        ? withParams(openChat ? "/screens/admin-complaints/chat" : "/screens/admin-complaints/detail", { id: String(complaintId) })
        : "/screens/complaints";
    }
    return withParams(
      openChat
        ? (managing ? "/screens/admin-complaints/chat" : "/screens/complaints/chat")
        : (managing ? "/screens/admin-complaints/report-detail" : "/screens/complaints/detail"),
      { id: String(complaintId) },
    );
  }

  const noticeMatch = url.match(/\/notices\/(\d+)/i);
  if (noticeMatch) {
    const id = noticeMatch[1];
    const categoryHint = String(notification?.category ?? queryParams.category ?? "").toLowerCase();
    const isEvent =
      categoryHint === "event" ||
      String(notification?.title ?? "").toLowerCase().includes("event") ||
      String(notification?.description ?? "").toLowerCase().includes("event") ||
      String(notification?.description ?? "").toLowerCase().includes("joined your event") ||
      String(notification?.description ?? "").toLowerCase().includes("left your event") ||
      String(notification?.description ?? "").toLowerCase().includes("seat available");
    return getNoticeDetailRoute(isEvent ? { id, category: "event" } : { id, category: categoryHint || "general" });
  }

  if (pathname === "/admin/units" || pathname.includes("/screens/admin-units")) {
    return adminUnitsRoute(notification, {
      unitId: queryParams.unitId ?? queryParams.unit_id ?? queryParams.unit,
      unitNumber: queryParams.unitNumber ?? queryParams.unit_number,
    });
  }

  if (pathname.startsWith("/admin/") || pathname.includes("review_status=pending")) {
    return (
      resolveAdminPendingRoute(pathname, queryParams, notification) ??
      resolveNotificationRouteFallback(notification)
    );
  }

  if (pathname.includes("/screens/admin-content-review")) {
    const kind = queryParams.kind ?? "notice";
    return withParams("/screens/admin-content-review", { kind });
  }

  // Legacy broken path — no /screens/notices route exists.
  if (pathname === "/screens/notices" || pathname === "/notices") {
    return { pathname: "/(tabs)/notices" };
  }

  const conversationMatch = pathname.match(/\/conversations\/(\d+)/i);
  if (conversationMatch) {
    return withParams("/screens/messages/chat", {
      conversationId: conversationMatch[1],
      listingId: queryParams.listingId ?? queryParams.listing_id,
      recipientName: queryParams.recipientName,
      recipientRole: queryParams.recipientRole ?? queryParams.recipient_role,
    });
  }

  if (pathname.includes("/messages/chat")) {
    return withParams("/screens/messages/chat", {
      conversationId: queryParams.conversationId ?? queryParams.conversation_id,
      listingId: queryParams.listingId ?? queryParams.listing_id,
      recipientName: queryParams.recipientName,
      recipientRole: queryParams.recipientRole ?? queryParams.recipient_role,
    });
  }

  if (pathname.includes("listing-detail")) {
    const id = queryParams.id ?? queryParams.listingId ?? queryParams.listing_id;
    if (id) {
      return withParams("/screens/listing-detail", { id });
    }
  }

  if (pathname.includes("/community-feed/comments")) {
    const postId = queryParams.postId ?? queryParams.post_id;
    if (postId) {
      return withParams("/screens/community-feed/comments", {
        postId,
        ...(queryParams.poll ? { poll: queryParams.poll } : {}),
      });
    }
    return { pathname: "/screens/community-feed" };
  }

  if (pathname.includes("community-feed")) {
    return { pathname: "/screens/community-feed" };
  }

  if (pathname.includes("/messages")) {
    return { pathname: "/screens/messages" };
  }

  if (pathname.includes("guest-approvals")) {
    return { pathname: "/screens/guest-approvals" };
  }

  if (pathname.includes("invite-code")) {
    return null;
  }

  if (pathname.startsWith("/screens/") || pathname.startsWith("/(tabs)/")) {
    if (!isAllowedMobilePath(pathname)) {
      return resolveNotificationRouteFallback(notification);
    }
    return withParams(pathname, queryParams);
  }

  return resolveNotificationRouteFallback(notification);
}

export async function fetchNotifications({ page = 1, perPage = 15 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  const res = await apiRequest(`/notifications?${params.toString()}`);
  const notifications = sortNotifications(
    (res?.data ?? []).map(normalizeNotification).filter(Boolean),
  );
  const unread =
    typeof res?.unread === "number"
      ? res.unread
      : notifications.filter((item) => !item.read).length;
  const meta = res?.meta ?? {};

  return {
    notifications,
    unread,
    meta: {
      currentPage: meta.current_page ?? page,
      lastPage: meta.last_page ?? 1,
      total: meta.total ?? notifications.length,
      perPage: meta.per_page ?? perPage,
    },
  };
}

export async function fetchNotificationUnreadCount() {
  const res = await apiRequest("/notifications?page=1&per_page=1");
  return {
    unread: typeof res?.unread === "number" ? res.unread : 0,
    messageAlerts: typeof res?.unread_messages === "number" ? res.unread_messages : 0,
  };
}

export async function markNotificationRead(id) {
  await apiRequest(`/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead() {
  await apiRequest("/notifications/read-all", { method: "POST" });
}
