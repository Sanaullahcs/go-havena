import { apiRequest } from "./api-client";
import { getCommunityId } from "./auth-session";

export const REPORT_TYPES = [
  { value: "spam", label: "Spam or misleading" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "safety", label: "Safety concern" },
  { value: "damage", label: "Property damage" },
  { value: "noise", label: "Noise or disturbance" },
  { value: "other", label: "Other" },
];

/**
 * POST /v1/reports — file a moderation report against a neighbor or post.
 */
export async function fileReport({
  type,
  title,
  description,
  reportedUserId,
  severity = "medium",
} = {}) {
  const communityId = await getCommunityId();

  const body = {
    type,
    title,
    description,
    severity,
  };

  if (reportedUserId) {
    body.reported_user_id = reportedUserId;
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
