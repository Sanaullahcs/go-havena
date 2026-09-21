import i18n from "../i18n";
import { GUEST_PERMISSION_OPTIONS } from "../constants/guest-permissions";
import { getApiErrorCode, getApiErrorMessage } from "./api-error-core";
import { buildBlockedAccountDialogOptions } from "./blocked-account-dialog";
import { formatDisplayDate, formatDisplayTime } from "./form-datetime";

export const ACCOUNT_RESTRICTED_CODES = new Set([
  "ACCOUNT_SUSPENDED",
  "COMMUNITY_DEACTIVATED",
  "MEMBERSHIP_REJECTED",
  "COMMUNITY_ADMIN_REJECTED",
  "COMMUNITY_REQUEST_REJECTED",
]);

function permissionLabel(feature) {
  const option = GUEST_PERMISSION_OPTIONS.find((item) => item.key === feature);
  return option?.label ?? i18n.t("guestPermissions.thisFeature");
}

function featureMeta(feature) {
  const option = GUEST_PERMISSION_OPTIONS.find((item) => item.key === feature);
  return {
    label: option?.label ?? i18n.t("guestPermissions.communityContent"),
    description: option?.description ?? i18n.t("guestPermissions.communityContentDesc"),
    icon: option?.icon ?? "lock",
  };
}

export function isGuestPermissionDeniedError(error) {
  return getApiErrorCode(error) === "GUEST_FEATURE_DENIED";
}

export function isAccountRestrictedError(error) {
  const code = getApiErrorCode(error);
  return Boolean(code && ACCOUNT_RESTRICTED_CODES.has(code));
}

export function isUserLocallyRestricted(user) {
  if (!user) return false;
  if (String(user.status ?? "").toLowerCase() === "suspended") return true;
  const memberships = user.memberships ?? [];
  return memberships.some((membership) => String(membership.status ?? "").toLowerCase() === "banned");
}

export function formatRestrictedSince(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${formatDisplayDate(date)} at ${formatDisplayTime(date)}`;
}

export function createLocalAccountRestrictedError(user, feature) {
  const suspendedMembership = (user?.memberships ?? []).find(
    (membership) => String(membership.status ?? "").toLowerCase() === "banned",
  );

  const suspendedAt =
    user?.restricted_at ??
    user?.updated_at ??
    suspendedMembership?.updated_at ??
    null;

  return {
    name: "ApiError",
    message: i18n.t("blockedAccount.message"),
    code: "ACCOUNT_SUSPENDED",
    status: 403,
    statusKind: "suspended",
    rejectedBy: "community_admin",
    feature,
    suspendedAt,
    suspended_at: suspendedAt,
  };
}

/** Map API / screen errors to user-facing permission copy. */
export function resolveGuestFeatureError(error, fallbackFeature, defaultTitle) {
  if (!defaultTitle) defaultTitle = i18n.t("guestPermissions.couldNotLoadContent");

  if (typeof error === "string") {
    return {
      isPermissionDenied: false,
      isAccountRestricted: false,
      title: defaultTitle,
      message: error,
      icon: "wifi-off",
      hideRetry: false,
    };
  }

  const code = getApiErrorCode(error);
  const feature = error?.feature ?? fallbackFeature ?? null;
  const label = permissionLabel(feature);

  if (code === "GUEST_FEATURE_DENIED") {
    return {
      isPermissionDenied: true,
      isAccountRestricted: false,
      feature,
      title: i18n.t("guestPermissions.featureNotAllowed", { feature: label }),
      message:
        getApiErrorMessage(error) ||
        i18n.t("guestPermissions.featureDeniedMsg", { feature: label.toLowerCase() }),
      icon: "lock",
      hideRetry: true,
    };
  }

  if (isAccountRestrictedError(error)) {
    const dialog = buildBlockedAccountDialogOptions(error, getApiErrorMessage(error));
    const meta = featureMeta(feature);
    const restrictedSince = formatRestrictedSince(error?.suspendedAt ?? error?.suspended_at ?? null);

    return {
      isPermissionDenied: false,
      isAccountRestricted: true,
      feature,
      featureLabel: meta.label,
      featureDescription: meta.description,
      featureIcon: meta.icon,
      title: dialog.title,
      message: dialog.message,
      statusLabel: dialog.statusLabel,
      meta: dialog.meta,
      highlight: dialog.highlight,
      restrictedSince,
      icon: "slash",
      hideRetry: true,
    };
  }

  return {
    isPermissionDenied: false,
    isAccountRestricted: false,
    title: defaultTitle,
    message: getApiErrorMessage(error) || i18n.t("guestPermissions.somethingWentWrong"),
    icon: "wifi-off",
    hideRetry: false,
  };
}

export function guestPermissionDialogTitle(error, fallbackFeature) {
  const resolved = resolveGuestFeatureError(error, fallbackFeature);
  if (resolved.isPermissionDenied) return resolved.title;
  if (resolved.isAccountRestricted) return resolved.title;
  return null;
}

export function isFeatureAccessBlockedError(error) {
  return isGuestPermissionDeniedError(error) || isAccountRestrictedError(error);
}
