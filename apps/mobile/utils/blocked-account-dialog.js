import i18n from "../i18n";

export const ACCOUNT_SUSPENDED_TITLE = i18n.t("blockedAccount.title");

export const ACCOUNT_SUSPENDED_MESSAGE = i18n.t("blockedAccount.message");

function formatRejectedBy(rejectedBy) {
  if (!rejectedBy) return null;
  if (rejectedBy === "system_admin") return i18n.t("blockedAccount.systemAdmin");
  if (rejectedBy === "community_admin") return i18n.t("blockedAccount.communityAdmin");
  return rejectedBy.replace(/_/g, " ");
}

function isRejectedBlock(error) {
  if (error?.statusKind === "rejected") return true;
  return String(error?.code ?? "").includes("REJECTED");
}

function blockedAccountTitle(error) {
  const code = error?.code;

  if (code === "MEMBERSHIP_REJECTED") return i18n.t("blockedAccount.membershipDeclined");
  if (code === "COMMUNITY_ADMIN_REJECTED") return i18n.t("blockedAccount.adminDeclined");
  if (code === "COMMUNITY_REQUEST_REJECTED") return i18n.t("blockedAccount.communityRequestDeclined");
  if (code === "COMMUNITY_DEACTIVATED") return i18n.t("blockedAccount.communityDeactivated");
  if (isRejectedBlock(error)) return i18n.t("blockedAccount.accountNotApproved");
  return i18n.t("blockedAccount.title");
}

function blockedAccountIntro(error, fallbackMessage) {
  const code = error?.code;

  if (code === "MEMBERSHIP_REJECTED") {
    return i18n.t("blockedAccount.membershipDeclinedMsg");
  }
  if (code === "COMMUNITY_ADMIN_REJECTED") {
    return i18n.t("blockedAccount.adminDeclinedMsg");
  }
  if (code === "COMMUNITY_REQUEST_REJECTED") {
    return i18n.t("blockedAccount.communityRequestDeclinedMsg");
  }
  if (code === "COMMUNITY_DEACTIVATED") {
    return i18n.t("blockedAccount.communityDeactivatedMsg");
  }
  if (isRejectedBlock(error)) {
    return i18n.t("blockedAccount.accountNotApprovedMsg");
  }

  return fallbackMessage || error?.message || i18n.t("blockedAccount.message");
}

function blockedStatusLabel(error) {
  if (isRejectedBlock(error)) return i18n.t("blockedAccount.declined");
  if (error?.statusKind === "suspended" || error?.code === "ACCOUNT_SUSPENDED") return i18n.t("blockedAccount.suspended");
  if (error?.code === "COMMUNITY_DEACTIVATED") return i18n.t("blockedAccount.deactivated");
  if (!error) return i18n.t("blockedAccount.suspended");
  return i18n.t("blockedAccount.restricted");
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
      label: i18n.t("blockedAccount.status"),
      value: blockedStatusLabel(error),
      tone: rejected ? "danger" : "default",
    },
  ];

  if (rejected && rejectedBy) {
    meta.push({ label: i18n.t("blockedAccount.reviewedBy"), value: rejectedBy });
  }

  const highlight =
    rejected || reason
      ? {
          label: rejected ? i18n.t("blockedAccount.reasonForDecline") : i18n.t("blockedAccount.additionalDetails"),
          value:
            reason ||
            i18n.t("blockedAccount.noReasonProvided"),
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
    actions: [{ key: "ok", label: i18n.t("blockedAccount.gotIt"), variant: "primary" }],
  };
}
