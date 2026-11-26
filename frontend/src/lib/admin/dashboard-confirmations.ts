import { confirmAction, confirmDelete, confirmRejectWithReason } from "@/lib/alert";
import type { AdminDashboardPendingAction } from "@/lib/api/dashboard";

export type PendingVerb = "approve" | "reject";

function contentLabel(type: AdminDashboardPendingAction["type"]) {
  switch (type) {
    case "post":
      return "post";
    case "listing":
      return "listing";
    case "notice":
      return "notice";
    case "event":
      return "event";
    case "alert":
      return "alert";
    case "membership":
      return "membership request";
    case "family_add_member":
      return "family member request";
    case "community_admin":
      return "community admin application";
    default:
      return "item";
  }
}

/** Confirmation dialog for approve/reject actions on dashboard pending queues. */
export async function confirmPendingDashboardAction(
  action: AdminDashboardPendingAction,
  verb: PendingVerb,
) {
  if (verb === "approve") {
    switch (action.type) {
      case "membership":
        return confirmAction({
          title: `Approve ${action.title}?`,
          text: action.family_number
            ? `They will be approved for ${action.subtitle}, then the family head for ${action.family_number} will confirm family membership.`
            : `They will gain access to ${action.subtitle}.`,
          confirmText: "Approve",
          color: "green",
        });
      case "family_add_member":
        return confirmAction({
          title: `Approve ${action.title}?`,
          text: action.family_number
            ? `They are already a community resident. The family head for ${action.family_number} will be notified to confirm family membership.`
            : `The family head will be notified to confirm family membership.`,
          confirmText: "Approve",
          color: "green",
        });
      case "community_admin":
        return confirmAction({
          title: `Approve ${action.title}?`,
          text: `They will be able to manage ${action.subtitle}.`,
          confirmText: "Approve",
          color: "green",
        });
      case "post":
        return confirmAction({
          title: "Publish this post?",
          text: action.subtitle
            ? `It will become visible in ${action.subtitle}.`
            : "It will become visible in the community feed.",
          confirmText: "Publish",
          color: "green",
        });
      case "listing":
        return confirmAction({
          title: "Approve listing?",
          text: `"${action.title}" will go live in the marketplace.`,
          confirmText: "Approve",
          color: "green",
        });
      case "notice":
      case "event":
      case "alert":
        return confirmAction({
          title: `Approve this ${contentLabel(action.type)}?`,
          text: `"${action.title}" will be published to the community.`,
          confirmText: "Approve",
          color: "green",
        });
      case "landlord_ownership":
        return confirmAction({
          title: `Approve landlord claim for ${action.title}?`,
          text: action.detail ?? "Landlord tools and billing rules will apply after approval.",
          confirmText: "Approve",
          color: "green",
        });
      default:
        return confirmAction({ title: "Confirm action?", confirmText: "Confirm" });
    }
  }

  switch (action.type) {
    case "membership":
      return confirmRejectWithReason({
        title: `Reject ${action.title}?`,
        text: "A reason is required. The resident will see it in the mobile app.",
        confirmText: "Reject",
      });
    case "family_add_member":
      return confirmRejectWithReason({
        title: `Reject ${action.title}?`,
        text: "A reason is required. The family add request will be cancelled and the family head will be notified.",
        confirmText: "Reject",
      });
    case "post":
      return confirmDelete({
        title: "Reject this post?",
        text: "The author will be notified. This post will not appear in the feed.",
        confirmText: "Reject",
      });
    case "listing":
      return confirmDelete({
        title: "Reject this listing?",
        text: "The seller will be notified. This listing will not go live.",
        confirmText: "Reject",
      });
    case "notice":
    case "event":
    case "alert":
      return confirmAction({
        title: `Reject this ${contentLabel(action.type)}?`,
        text: `"${action.title}" will not be published. The author will be notified.`,
        confirmText: "Reject",
        color: "red",
        icon: "warning",
      });
    default:
      return confirmAction({
        title: "Confirm rejection?",
        text: "This action cannot be easily undone.",
        confirmText: "Reject",
        color: "red",
        icon: "warning",
      });
  }
}

export async function confirmSendMemberInvite(name: string, email: string) {
  return confirmAction({
    title: "Send invite?",
    text: `An invite code will be sent to ${name} at ${email}.`,
    confirmText: "Send invite",
    color: "blue",
  });
}

export async function confirmPublishCommunityContent(
  kind: "notice" | "event" | "alert",
  title: string,
) {
  const kindLabel = kind === "notice" ? "notice" : kind === "event" ? "event" : "alert";
  const isAlert = kind === "alert";
  return confirmAction({
    title: `Publish this ${kindLabel}?`,
    text: title
      ? `"${title}" will be visible to community members${isAlert ? " as an urgent alert" : ""}.`
      : `This ${kindLabel} will be visible to community members.`,
    confirmText: "Publish",
    color: isAlert ? "amber" : "green",
    icon: isAlert ? "warning" : "question",
  });
}

export async function confirmMarkAllNotificationsRead(unreadCount: number) {
  return confirmAction({
    title: "Mark all as read?",
    text: `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"} will be marked as read.`,
    confirmText: "Mark all read",
    color: "blue",
  });
}
