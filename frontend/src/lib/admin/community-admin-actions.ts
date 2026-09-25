import type {
  CommunityAdminAction,
  CommunityAdminApplicant,
  CommunityAdminLifecycleStatus,
} from "@/lib/api/community-admins";

const ACTIONS_BY_STATUS: Record<CommunityAdminLifecycleStatus, CommunityAdminAction[]> = {
  pending: ["view", "approve", "reject"],
  active: ["view", "edit", "release", "suspend", "delete"],
  suspended: ["view", "edit", "reactivate", "delete"],
  reassign: ["view", "edit", "assign_community", "delete"],
  rejected: ["view", "approve", "delete_record"],
};

export function resolveCommunityAdminLifecycle(
  item: CommunityAdminApplicant,
): CommunityAdminLifecycleStatus {
  if (item.lifecycle_status) return item.lifecycle_status;
  if (item.community_admin_status === "pending") return "pending";
  if (item.community_admin_status === "rejected") return "rejected";
  if (item.community_admin_status === "approved" && item.status === "suspended") return "suspended";
  if (item.community_admin_status === "approved" && (item.needs_reassign || !item.community_request)) {
    return "reassign";
  }
  return "active";
}

export function communityAdminAllows(
  item: CommunityAdminApplicant,
  action: CommunityAdminAction,
): boolean {
  const actions = item.allowed_actions?.length
    ? item.allowed_actions
    : ACTIONS_BY_STATUS[resolveCommunityAdminLifecycle(item)];

  if (action === "delete") {
    return actions.includes("delete") || actions.includes("delete_record");
  }

  return actions.includes(action);
}
