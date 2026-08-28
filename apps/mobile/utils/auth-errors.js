import i18n from "../i18n";
import { describeApiConnectionHint, isDevTestEmail, isDevTestPhone } from "../constants/api-config";
import { setBlockedAccountNotice } from "../services/auth-session";
import { getApiErrorCode, getApiErrorMessage } from "./api-error-core";
import {
  blockedAccountNoticeFromError,
  buildBlockedAccountDialogOptions,
} from "./blocked-account-dialog";
import { guestPermissionDialogTitle, resolveGuestFeatureError } from "./guest-permission-errors";

export { getApiErrorCode, getApiErrorMessage } from "./api-error-core";
export {
  ACCOUNT_SUSPENDED_MESSAGE,
  ACCOUNT_SUSPENDED_TITLE,
  blockedAccountNoticeFromError,
  buildBlockedAccountDialogOptions,
} from "./blocked-account-dialog";

const BLOCKED_ACCOUNT_CODES = new Set([
  "ACCOUNT_SUSPENDED",
  "COMMUNITY_DEACTIVATED",
  "COMMUNITY_ADMIN_REJECTED",
  "COMMUNITY_REQUEST_REJECTED",
  "MEMBERSHIP_REJECTED",
]);

export function isAccountSuspendedError(error) {
  return BLOCKED_ACCOUNT_CODES.has(error?.code);
}

export async function persistBlockedAccountNotice(error) {
  const notice = blockedAccountNoticeFromError(error);
  if (notice) {
    await setBlockedAccountNotice(notice);
  }
}

export async function showSuspendedAccountDialog(dialog, message, error) {
  await dialog.showDialog(buildBlockedAccountDialogOptions(error, message));
}

export function loginRouteWithSuspendedNotice() {
  return { pathname: "/screens/login", params: { suspended: "1" } };
}

/** Contextual auth error handling with interactive dialog actions. */
export async function handleAuthApiError(error, dialog, router, { phone, email } = {}) {
  const code = getApiErrorCode(error);
  const message = getApiErrorMessage(error);

  if (code === "ACCOUNT_EXISTS_USE_LOGIN") {
    await dialog.showDialog({
      type: "warning",
      title: i18n.t("auth.alreadyRegistered"),
      message: i18n.t("auth.alreadyRegisteredMsg"),
      actions: [
        {
          key: "cancel",
          label: i18n.t("common.cancel"),
          variant: "secondary",
          onPress: () => {},
        },
        {
          key: "login",
          label: i18n.t("auth.goToLogin"),
          variant: "primary",
          onPress: () => router.replace("/screens/login"),
        },
      ],
    });
    return;
  }

  if (code === "ACCOUNT_NOT_FOUND_USE_SIGNUP") {
    await dialog.showDialog({
      type: "info",
      title: i18n.t("auth.noAccountFound"),
      message: i18n.t("auth.noAccountFoundMsg"),
      actions: [
        {
          key: "cancel",
          label: i18n.t("common.cancel"),
          variant: "secondary",
          onPress: () => {},
        },
        {
          key: "signup",
          label: i18n.t("auth.signUp"),
          variant: "primary",
          onPress: () => router.push("/screens/roles"),
        },
      ],
    });
    return;
  }

  if (isAccountSuspendedError(error)) {
    await showSuspendedAccountDialog(dialog, message, error);
    return;
  }

  if (code === "RATE_LIMITED") {
    await dialog.showError(i18n.t("auth.tooManyAttempts"), message);
    return;
  }

  if (code === "INVALID_OTP") {
    await dialog.showError(i18n.t("auth.invalidCode"), message);
    return;
  }

  if (code === "INVALID_PHONE" || code === "INVALID_EMAIL") {
    await dialog.showError(
      code === "INVALID_EMAIL" ? i18n.t("auth.invalidEmail") : i18n.t("auth.invalidPhoneNumber"),
      message,
    );
    return;
  }

  if (code === "ACCESS_NOT_STARTED") {
    await dialog.showError(i18n.t("guest.accessNotStartedTitle"), message);
    return;
  }

  if (code === "GUEST_ACCESS_EXPIRED") {
    await dialog.showError(i18n.t("guest.guestAccessExpired"), message);
    return;
  }

  if (code === "GUEST_ACCESS_REVOKED" || code === "GUEST_ACCESS_REJECTED") {
    await dialog.showError(i18n.t("guest.guestAccessRevoked"), message);
    return;
  }

  if (code === "GUEST_FEATURE_DENIED") {
    const resolved = resolveGuestFeatureError(error, error?.feature);
    await dialog.showDialog({
      type: "warning",
      layout: "status",
      title: resolved.title,
      message: resolved.message,
      statusLabel: i18n.t("auth.notIncluded"),
      highlight: {
        label: i18n.t("auth.whatYouCanDo"),
        value: i18n.t("auth.contactResidentOrAdmin"),
      },
      actions: [{ key: "ok", label: i18n.t("blockedAccount.gotIt"), variant: "primary" }],
    });
    return;
  }

  if (code === "TIMEOUT" || code === "NETWORK_ERROR") {
    const devHint =
      __DEV__ && ((email && isDevTestEmail(email)) || (phone && isDevTestPhone(phone)))
        ? "\n\nEnsure `npm run backend` is running. Android emulator uses http://10.0.2.2:8000 automatically."
        : "";
    await dialog.showError(
      i18n.t("auth.connectionProblem"),
      `${message}\n\n${describeApiConnectionHint()}${devHint}`,
    );
    return;
  }

  await dialog.showError(i18n.t("common.error"), message || i18n.t("auth.pleaseTryAgain"));
}

export async function showApiSuccess(dialog, title, message) {
  await dialog.showSuccess(title, message);
}

export async function showApiFailure(dialog, title, error, field) {
  const permissionTitle = guestPermissionDialogTitle(error, error?.feature);
  await dialog.showError(
    permissionTitle ?? title,
    getApiErrorMessage(error, field),
  );
}
