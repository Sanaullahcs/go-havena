import i18n from "../i18n";
import { API_BASE_URL } from "../constants/api-config";
import { getCommunityId, getToken, getUser, clearSession, notifyGuestSessionTerminated } from "./auth-session";
import { isGuestUser } from "./community-access";
import { syncAccountRestrictionFromError, isAccountRestrictedError } from "../utils/account-access-sync";
import {
  createLocalAccountRestrictedError,
  isUserLocallyRestricted,
} from "../utils/guest-permission-errors";

import { ApiError } from "./api-error";

export { ApiError } from "./api-error";

function isNetworkFailure(err) {
  if (!err) return false;
  if (err instanceof ApiError) return false;
  const name = String(err.name ?? "").toLowerCase();
  const msg = String(err.message ?? "").toLowerCase();
  const cause = String(err.cause?.message ?? err.cause ?? "").toLowerCase();
  const text = `${name} ${msg} ${cause}`;
  return (
    name === "aborterror" ||
    text.includes("network request failed") ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("could not connect") ||
    text.includes("connection refused") ||
    text.includes("internet connection appears to be offline") ||
    text.includes("fetch request has been cancelled") ||
    text.includes("cancelled") ||
    text.includes("timeout")
  );
}

async function invalidateGuestSessionIfNeeded(status, code) {
  const shouldInvalidateGuest =
    status === 401 ||
    code === "GUEST_ACCESS_REVOKED" ||
    code === "GUEST_ACCESS_REJECTED" ||
    code === "GUEST_ACCESS_EXPIRED";

  if (!shouldInvalidateGuest) return;

  try {
    const user = await getUser();
    if (!isGuestUser(user)) return;
    await clearSession();
    notifyGuestSessionTerminated(
      code === "GUEST_ACCESS_EXPIRED" ? "GUEST_ACCESS_EXPIRED" : "GUEST_ACCESS_REVOKED",
    );
  } catch {
    // ignore storage errors during forced guest logout
  }
}

function parseJsonBody(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // PHP/HTML warnings may be prepended to JSON on some dev servers.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    return { message: text };
  }
}

async function parseResponse(response) {
  const text = await response.text();
  const body = parseJsonBody(text);

  if (!response.ok) {
    await invalidateGuestSessionIfNeeded(response.status, body?.code);

    if (response.status === 401) {
      const user = await getUser({ reload: true });
      if (isUserLocallyRestricted(user)) {
        const local = createLocalAccountRestrictedError(user, body?.feature ?? null);
        throw new ApiError(local.message, {
          status: 403,
          code: local.code,
          statusKind: local.statusKind,
          rejectedBy: local.rejectedBy,
          feature: local.feature,
          suspendedAt: local.suspendedAt,
        });
      }
    }

    const apiError = new ApiError(apiErrorMessage(body, response), {
      status: response.status,
      code: body?.code,
      errors: body?.errors,
      statusKind: body?.status,
      reason: body?.reason,
      rejectedBy: body?.rejected_by,
      feature: body?.feature,
      suspendedAt: body?.suspended_at ?? null,
    });

    if (response.status === 403 && isAccountRestrictedError(apiError)) {
      await syncAccountRestrictionFromError(apiError);
    }

    throw apiError;
  }

  if (response.status === 204) return null;
  return body;
}

function apiErrorMessage(body, response) {
  const fieldMessage =
    body?.errors?.region_id?.[0] ??
    (body?.errors && Object.keys(body.errors)[0]
      ? body.errors[Object.keys(body.errors)[0]]?.[0]
      : null);

  if (fieldMessage && !String(fieldMessage).includes("<!DOCTYPE")) {
    return fieldMessage;
  }

  if (body?.message && !String(body.message).includes("<!DOCTYPE") && !/<[^>]+>/.test(String(body.message))) {
    return body.message;
  }

  if (response.status === 401) {
    return i18n.t("apiErrors.sessionExpired");
  }

  if (response.status >= 500) {
    return i18n.t("apiErrors.serverError");
  }

  return i18n.t("apiErrors.requestFailed");
}

export async function apiRequest(path, { method = "GET", body, auth = true, community = true, timeoutMs = 25000 } = {}) {
  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  if (community) {
    const communityId = await getCommunityId();
    if (communityId) headers["X-Community-Id"] = communityId;
  }

  // localtunnel shows an interstitial page unless this header is sent
  if (API_BASE_URL.includes("loca.lt")) {
    headers["Bypass-Tunnel-Reminder"] = "true";
  }

  let timeoutId;

  const requestPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return parseResponse(response);
    } catch (err) {
      if (isNetworkFailure(err)) {
        throw new ApiError(
          i18n.t("apiErrors.networkError"),
          { status: 0, code: "NETWORK_ERROR" },
        );
      }
      throw err;
    }
  })();

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new ApiError(i18n.t("apiErrors.timeout"), {
          status: 408,
          code: "TIMEOUT",
        }),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}
