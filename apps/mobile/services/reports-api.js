import { apiRequest } from "./api-client";
import { getCommunityId } from "./auth-session";
import i18n from "../i18n";

export function getReportTypes() {
  return [
    { value: "spam", label: i18n.t("feed.reportSpam") },
    { value: "harassment", label: i18n.t("feed.reportHarassment") },
    { value: "safety", label: i18n.t("feed.reportSafety") },
    { value: "damage", label: i18n.t("feed.reportDamage") },
    { value: "noise", label: i18n.t("feed.reportNoise") },
    { value: "other", label: i18n.t("feed.reportOther") },
  ];
}

/** @deprecated Use getReportTypes() instead for translated labels */
export const REPORT_TYPES = new Proxy([], {
  get(target, prop) {
    const types = getReportTypes();
    if (prop === Symbol.iterator) return types[Symbol.iterator].bind(types);
    return Reflect.get(types, prop);
  },
});

/**
 * POST /v1/reports — file a moderation report against a neighbor or post.
 */
export async function fileReport({
  type,
  title,
  description,
  reportedUserId,
  listingId,
  severity = "medium",
} = {}) {
  const communityId = await getCommunityId();

  const body = {
    type,
    title,
    description: description ?? "",
    severity,
  };

  if (reportedUserId) {
    body.reported_user_id = reportedUserId;
  }
  if (listingId) {
    body.listing_id = listingId;
  }
  if (communityId) {
    body.community_id = communityId;
  }

  const res = await apiRequest("/reports", {
    method: "POST",
    body,
  });

  return {
    id: res?.data?.id ?? null,
    message: res?.message ?? "Report filed successfully",
  };
}
