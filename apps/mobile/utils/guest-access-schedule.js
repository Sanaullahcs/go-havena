import i18n from "../i18n";
import { clearSession, getUser } from "../services/auth-session";
import { logout } from "../services/auth-api";
import { isGuestUser } from "../services/community-access";
import { Routes } from "../constants/onboarding-routes";

export const GUEST_ACCESS_NOT_STARTED_MESSAGE = i18n.t("guest.accessNotStartedMsg");

export const GUEST_ACCESS_EXPIRED_MESSAGE = i18n.t("guest.accessExpiredMsg");

export const GUEST_ACCESS_REVOKED_MESSAGE = i18n.t("guest.accessRevokedMsg");

export function isGuestAccessExpiredError(error) {
  return error?.code === "GUEST_ACCESS_EXPIRED";
}

export function isGuestAccessRevokedError(error) {
  return error?.code === "GUEST_ACCESS_REVOKED";
}

export function isGuestAccessRejectedError(error) {
  return error?.code === "GUEST_ACCESS_REJECTED";
}

export function isGuestAccessNotStartedError(error) {
  return error?.code === "ACCESS_NOT_STARTED";
}

export function isGuestAccessTerminatedStatus(status) {
  return status === "revoked" || status === "rejected" || status === "expired";
}

export function isGuestAccessScheduleError(error) {
  return isGuestAccessExpiredError(error) || isGuestAccessNotStartedError(error);
}

export function isGuestAccessTerminationError(error) {
  return (
    isGuestAccessExpiredError(error) ||
    isGuestAccessRevokedError(error) ||
    error?.code === "GUEST_ACCESS_REJECTED"
  );
}

export function msUntil(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return null;
  return target - Date.now();
}

export function isGuestAccessWindowActive(guestAccess) {
  if (!guestAccess?.starts_at || !guestAccess?.ends_at) {
    return guestAccess?.access_window_active === true;
  }

  const now = Date.now();
  const startsAt = new Date(guestAccess.starts_at).getTime();
  const endsAt = new Date(guestAccess.ends_at).getTime();

  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
    return guestAccess?.access_window_active === true;
  }

  return now >= startsAt && now <= endsAt;
}

/** Clear the session and return to guest login when access ends or is revoked. */
export async function revokeGuestSessionAndRedirect(
  router,
  { keepBiometricUnlock = false, notice = null } = {},
) {
  try {
    await logout({ revokeServer: false });
  } catch {
    await clearSession({ keepBiometricUnlock });
  }

  router.replace({
    pathname: "/screens/guest-login",
    params: notice ? { notice } : {},
  });
}

export function guestLoginRouteWithNotice(code) {
  return {
    pathname: "/screens/guest-login",
    params: code ? { notice: code } : {},
  };
}

function encodeGuestRejectedParams(error, email) {
  const invitation = error?.guestInvitation ?? {};
  const params = {
    guest: "1",
    rejected: "1",
  };

  if (email) params.email = email;
  if (error?.rejectionReason ?? invitation.rejection_reason) {
    params.rejection_reason = String(error?.rejectionReason ?? invitation.rejection_reason);
  }
  if (invitation.community_name) params.community_name = String(invitation.community_name);
  if (invitation.guest_name) params.guest_name = String(invitation.guest_name);
  if (invitation.invite_code) params.invite_code = String(invitation.invite_code);
  if (invitation.starts_at) params.starts_at = String(invitation.starts_at);
  if (invitation.ends_at) params.ends_at = String(invitation.ends_at);
  if (invitation.invitation_type) params.invitation_type = String(invitation.invitation_type);

  const hostName =
    invitation.resident?.display_name ||
    invitation.resident?.name ||
    invitation.invited_by?.display_name ||
    invitation.invited_by?.name;
  if (hostName) params.host_name = String(hostName);
  if (invitation.resident?.unit_number) {
    params.host_unit = String(invitation.resident.unit_number);
  }

  return params;
}

/** Navigate to the guest declined status screen (works with or without a session). */
export function guestRejectedStatusRoute(error, email) {
  return {
    pathname: Routes.PENDING_COMMUNITY,
    params: encodeGuestRejectedParams(error, email),
  };
}

export async function navigateToGuestRejectedStatus(router, error, { email, clearSession = false } = {}) {
  if (clearSession) {
    try {
      await logout({ revokeServer: false });
    } catch {
      await clearSession();
    }
  }

  router.replace(guestRejectedStatusRoute(error, email));
}

export function guestAccessNoticeMessage(code) {
  if (code === "GUEST_ACCESS_EXPIRED") return GUEST_ACCESS_EXPIRED_MESSAGE;
  if (code === "GUEST_ACCESS_REVOKED" || code === "GUEST_ACCESS_REJECTED") {
    return GUEST_ACCESS_REVOKED_MESSAGE;
  }
  if (code === "ACCESS_NOT_STARTED") return GUEST_ACCESS_NOT_STARTED_MESSAGE;
  return null;
}

export async function handleGuestAccessTerminationError(error, router) {
  if (isGuestAccessRejectedError(error)) {
    await navigateToGuestRejectedStatus(router, error);
    return true;
  }

  if (isGuestAccessRevokedError(error)) {
    await revokeGuestSessionAndRedirect(router, { notice: "GUEST_ACCESS_REVOKED" });
    return true;
  }

  if (isGuestAccessExpiredError(error)) {
    await revokeGuestSessionAndRedirect(router, { notice: "GUEST_ACCESS_EXPIRED" });
    return true;
  }

  return false;
}

export async function handleGuestAccessScheduleError(error, router) {
  if (!isGuestAccessScheduleError(error)) return false;

  if (isGuestAccessExpiredError(error)) {
    await revokeGuestSessionAndRedirect(router, { notice: "GUEST_ACCESS_EXPIRED" });
    return true;
  }

  return false;
}

export async function handleGuestUnauthorized(error, router) {
  if (error?.status !== 401) return false;

  const user = await getUser();
  if (!isGuestUser(user)) return false;

  await revokeGuestSessionAndRedirect(router, { notice: "GUEST_ACCESS_REVOKED" });
  return true;
}

export async function enforceGuestAccessFromUser(user, router) {
  const status = user?.guest_access?.status;
  if (!isGuestAccessTerminatedStatus(status)) return false;

  if (status === "rejected") {
    router.replace({
      pathname: Routes.PENDING_COMMUNITY,
      params: { guest: "1", rejected: "1" },
    });
    return true;
  }

  const notice = status === "expired" ? "GUEST_ACCESS_EXPIRED" : "GUEST_ACCESS_REVOKED";
  await revokeGuestSessionAndRedirect(router, { notice });
  return true;
}

export { Routes };
