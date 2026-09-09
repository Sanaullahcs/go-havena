import { apiRequest } from "./api-client";
import { getCommunityId } from "./auth-session";
import i18n from "../i18n";

export const REPORT_REASON_KINDS = {
  post: "post",
  comment: "comment",
  profile: "profile",
  listing: "listing",
};

const POST_COMMENT_REASONS = [
  { value: "harassment", labelKey: "reportReasons.post.harassment" },
  { value: "hate", labelKey: "reportReasons.post.hate" },
  { value: "spam", labelKey: "reportReasons.post.spam" },
  { value: "inappropriate", labelKey: "reportReasons.post.inappropriate" },
  { value: "illegal", labelKey: "reportReasons.post.illegal" },
  { value: "privacy", labelKey: "reportReasons.post.privacy" },
  { value: "other", labelKey: "reportReasons.other" },
];

const PROFILE_REASONS = [
  { value: "harassment", labelKey: "reportReasons.profile.harassment" },
  { value: "impersonation", labelKey: "reportReasons.profile.impersonation" },
  { value: "fake_profile", labelKey: "reportReasons.profile.fakeProfile" },
  { value: "inappropriate", labelKey: "reportReasons.profile.inappropriate" },
  { value: "safety", labelKey: "reportReasons.profile.safety" },
  { value: "other", labelKey: "reportReasons.other" },
];

const LISTING_REASONS = [
  { value: "spam", labelKey: "reportReasons.listing.spam" },
  { value: "scam", labelKey: "reportReasons.listing.scam" },
  { value: "prohibited", labelKey: "reportReasons.listing.prohibited" },
  { value: "inappropriate", labelKey: "reportReasons.listing.inappropriate" },
  { value: "incorrect", labelKey: "reportReasons.listing.incorrect" },
  { value: "other", labelKey: "reportReasons.other" },
];

export function getReportReasons(kind = REPORT_REASON_KINDS.post) {
  const keys =
    kind === REPORT_REASON_KINDS.profile
      ? PROFILE_REASONS
      : kind === REPORT_REASON_KINDS.listing
        ? LISTING_REASONS
        : POST_COMMENT_REASONS;

  return keys.map((item) => ({
    value: item.value,
    label: i18n.t(item.labelKey),
  }));
}

/** @deprecated Use getReportReasons() for content-specific labels */
export function getReportTypes() {
  return getReportReasons(REPORT_REASON_KINDS.post);
}

/** @deprecated Use getReportReasons() instead for translated labels */
export const REPORT_TYPES = new Proxy([], {
  get(target, prop) {
    const types = getReportReasons(REPORT_REASON_KINDS.post);
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
