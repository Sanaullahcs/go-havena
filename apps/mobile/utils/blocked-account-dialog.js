export const ACCOUNT_SUSPENDED_TITLE = "Your account is suspended";

export const ACCOUNT_SUSPENDED_MESSAGE =
  "Your account has been suspended. Please contact your community administrator or support.";

function formatRejectedBy(rejectedBy) {
  if (!rejectedBy) return null;
  if (rejectedBy === "system_admin") return "System administrator";
  if (rejectedBy === "community_admin") return "Community administrator";
  return rejectedBy.replace(/_/g, " ");
}

function isRejectedBlock(error) {
  if (error?.statusKind === "rejected") return true;
  return String(error?.code ?? "").includes("REJECTED");
}

function blockedAccountTitle(error) {
  const code = error?.code;

  if (code === "MEMBERSHIP_REJECTED") return "Membership declined";
  if (code === "COMMUNITY_ADMIN_REJECTED") return "Admin application declined";
  if (code === "COMMUNITY_REQUEST_REJECTED") return "Community request declined";
  if (code === "COMMUNITY_DEACTIVATED") return "Community deactivated";
  if (isRejectedBlock(error)) return "Account not approved";
  return ACCOUNT_SUSPENDED_TITLE;
}

function blockedAccountIntro(error, fallbackMessage) {
  const code = error?.code;

  if (code === "MEMBERSHIP_REJECTED") {
    return "Your community admin declined your membership request. Review the details below or contact your community office if you have questions.";
  }
  if (code === "COMMUNITY_ADMIN_REJECTED") {
    return "Your community admin application was not approved. See the details below or contact support if you believe this was a mistake.";
  }
  if (code === "COMMUNITY_REQUEST_REJECTED") {
    return "Your community request was not approved. You can submit a new request with updated details.";
  }
  if (code === "COMMUNITY_DEACTIVATED") {
    return "Your community is no longer active. Contact your community administrator or Havena support for assistance.";
  }
  if (isRejectedBlock(error)) {
    return "Your account is not approved for access. Review the details below or contact support for help.";
  }

  return fallbackMessage || error?.message || ACCOUNT_SUSPENDED_MESSAGE;
}

function blockedStatusLabel(error) {
  if (isRejectedBlock(error)) return "Declined";
  if (error?.statusKind === "suspended" || error?.code === "ACCOUNT_SUSPENDED") return "Suspended";
  if (error?.code === "COMMUNITY_DEACTIVATED") return "Deactivated";
  if (!error) return "Suspended";
  return "Restricted";
}

export function blockedAccountNoticeFromError(error) {
  if (!error) return null;

  return {
    code: error.code ?? null,
    statusKind: error.statusKind ?? null,
    reason: String(error.reason ?? "").trim() || null,
    rejectedBy: error.rejectedBy ?? null,
    message: error.message ?? null,
  };
}

export function buildBlockedAccountDialogOptions(error, fallbackMessage) {
  const rejected = isRejectedBlock(error);
  const suspended =
    !rejected &&
    (error?.code === "ACCOUNT_SUSPENDED" ||
      error?.code === "COMMUNITY_DEACTIVATED" ||
      error?.statusKind === "suspended");
  const reason = String(error?.reason ?? "").trim();
  const rejectedBy = formatRejectedBy(error?.rejectedBy);
  const meta = [
    {
      label: "Status",
      value: blockedStatusLabel(error),
      tone: rejected ? "danger" : "default",
    },
  ];

  if (rejectedBy) {
    meta.push({ label: "Reviewed by", value: rejectedBy });
  }

  const highlight =
    rejected || reason
      ? {
          label: rejected ? "Reason for decline" : "Additional details",
          value:
            reason ||
            "No reason was provided. Contact your community office or Havena support for more information.",
        }
      : null;

  return {
    type: rejected ? "error" : suspended ? "info" : "warning",
    layout: "status",
    title: blockedAccountTitle(error),
    message: blockedAccountIntro(error, fallbackMessage),
    statusLabel: blockedStatusLabel(error),
    meta,
    highlight,
    actions: [{ key: "ok", label: "Got it", variant: "primary" }],
  };
}
