import { listingCategoryLabel } from "../components/discover/category-picker";
import { timeAgo } from "../services/feed-api";

export function statusLabel(status, t) {
  if (status === "approved") return t("topBar.suggestionApproved");
  if (status === "rejected") return t("topBar.suggestionRejected");
  return t("topBar.suggestionPending");
}

export function statusBadgeStyle(statusLabelFn, status, t, styles) {
  const label = statusLabelFn(status, t);
  if (status === "approved") return { wrap: styles.badgeApproved, text: styles.badgeApprovedText, label };
  if (status === "rejected") return { wrap: styles.badgeRejected, text: styles.badgeRejectedText, label };
  return { wrap: styles.badgePending, text: styles.badgePendingText, label };
}

export function suggestionSubtitle(item, t, now) {
  const section = item.essential_section || item.category;
  const catLabel = section ? listingCategoryLabel(section, t, section) : t("topBar.listingCategory");
  const rel = item.created_at ? timeAgo(item.created_at, now) : "";
  if (!rel) return catLabel;
  const action = item.status === "approved"
    ? t("topBar.suggestionUpdatedRelative", { time: rel })
    : t("topBar.suggestionSubmittedRelative", { time: rel });
  return `${catLabel} · ${action}`;
}
