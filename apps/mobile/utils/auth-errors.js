import { describeApiConnectionHint, isDevTestPhone } from "../constants/api-config";
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
export async function handleAuthApiError(error, dialog, router, { phone } = {}) {
  const code = getApiErrorCode(error);
  const message = getApiErrorMessage(error);

  if (code === "ACCOUNT_EXISTS_USE_LOGIN") {
    await dialog.showDialog({
      type: "warning",
      title: "Already registered",
      message: "This phone number belongs to an existing account. Please log in instead of signing up.",
      actions: [
        {
          key: "cancel",
          label: "Cancel",
          variant: "secondary",
          onPress: () => {},
        },
        {
          key: "login",
          label: "Go to Login",
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
      title: "No account found",
      message: "We couldn't find an account with this phone number. Would you like to sign up?",
      actions: [
        {
          key: "cancel",
          label: "Cancel",
          variant: "secondary",
          onPress: () => {},
        },
        {
          key: "signup",
          label: "Sign Up",
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
    await dialog.showError("Too many attempts", message);
    return;
  }

  if (code === "INVALID_OTP") {
    await dialog.showError("Invalid code", message);
    return;
  }

  if (code === "INVALID_PHONE") {
    await dialog.showError("Invalid phone number", message);
    return;
  }

  if (code === "ACCESS_NOT_STARTED") {
    await dialog.showError("Guest access not started", message);
    return;
  }

  if (code === "GUEST_ACCESS_EXPIRED") {
    await dialog.showError("Guest access expired", message);
    return;
  }

  if (code === "GUEST_ACCESS_REVOKED" || code === "GUEST_ACCESS_REJECTED") {
    await dialog.showError("Guest access revoked", message);
    return;
  }

  if (code === "GUEST_FEATURE_DENIED") {
    const resolved = resolveGuestFeatureError(error, error?.feature);
    await dialog.showDialog({
      type: "warning",
      layout: "status",
      title: resolved.title,
      message: resolved.message,
      statusLabel: "Not included",
      highlight: {
        label: "What you can do",
        value: "Contact the resident or community admin who invited you. They can update guest permissions on your invitation.",
      },
      actions: [{ key: "ok", label: "Got it", variant: "primary" }],
    });
    return;
  }

  if (code === "TIMEOUT" || code === "NETWORK_ERROR") {
    const devHint =
      __DEV__ && phone && isDevTestPhone(phone)
        ? "\n\nEnsure `npm run backend` is running. Android emulator uses http://10.0.2.2:8000 automatically."
        : "";
    await dialog.showError(
      "Connection problem",
      `${message}\n\n${describeApiConnectionHint()}${devHint}`,
    );
    return;
  }

  await dialog.showError("Something went wrong", message || "Please try again.");
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
