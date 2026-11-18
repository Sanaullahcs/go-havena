import i18n from "../i18n";
import { API_BASE_URL } from "../constants/api-config";
import { getCommunityId, getToken, getUser, clearSession, notifyGuestSessionTerminated } from "./auth-session";
import { isGuestUser } from "./community-access";
import { syncAccountRestrictionFromError, isAccountRestrictedError } from "../utils/account-access-sync";
import {
  createLocalAccountRestrictedError,
  isUserLocallyRestricted,
} from "../utils/guest-permission-errors";
import { looksLikeNetworkFailureMessage } from "../utils/api-error-core";
import { isDeviceOffline } from "./connectivity";

import { ApiError } from "./api-error";

export { ApiError } from "./api-error";

async function transportError({ timedOut = false } = {}) {
  if (await isDeviceOffline()) {
    return new ApiError(i18n.t("apiErrors.networkError"), { status: 0, code: "NETWORK_ERROR" });
  }
  if (timedOut) {
    return new ApiError(i18n.t("apiErrors.timeout"), { status: 408, code: "TIMEOUT" });
  }
  return new ApiError(i18n.t("apiErrors.serverError"), { status: 0, code: "SERVER_UNREACHABLE" });
}

function isNetworkFailure(err) {
  if (!err) return false;
  if (err instanceof ApiError) return false;
  const name = String(err.name ?? "").toLowerCase();
  const msg = String(err.message ?? "");
  const cause = String(err.cause?.message ?? err.cause ?? "");
  if (name === "aborterror") return true;
  return looksLikeNetworkFailureMessage(msg) || looksLikeNetworkFailureMessage(cause);
}

async function invalidateGuestSessionIfNeeded(status, code) {
  if (code === "GUEST_ACCESS_REJECTED") {
    return;
  }

  const shouldInvalidateGuest =
    status === 401 ||
    code === "GUEST_ACCESS_REVOKED" ||
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
      retryAfterSeconds: body?.retry_after_seconds ?? body?.rate_limit?.retry_after_seconds ?? null,
      rateLimit: body?.rate_limit ?? null,
      rejectionReason: body?.rejection_reason ?? null,
      guestInvitation: body?.invitation ?? null,
      meta: body?.meta ?? null,
    });

    if (response.status === 403 && isAccountRestrictedError(apiError)) {
      await syncAccountRestrictionFromError(apiError);
    }

    throw apiError;
  }

  if (response.status === 204) return null;
  return body;
}

export function safeApiMessage(message) {
  const text = String(message ?? "").trim();
  if (!text || text.includes("<!DOCTYPE") || /<[^>]+>/.test(text)) return "";
  if (/SQLSTATE|Unknown column|\bSQL:|Class ["'][^"']+["'] not found|ErrorException|Stack trace|syntax error,|Undefined (property|variable|constant|method)|Call to undefined|Allowed memory size/i.test(text)) {
    return "";
  }
  return text;
}

function apiErrorMessage(body, response) {
  const fieldMessage = safeApiMessage(
    body?.errors?.region_id?.[0] ??
    (body?.errors && Object.keys(body.errors)[0]
      ? body.errors[Object.keys(body.errors)[0]]?.[0]
      : null),
  );

  if (fieldMessage) {
    return fieldMessage;
  }

  const message = safeApiMessage(body?.message);
  if (message) {
    return message;
  }

  if (response.status === 401) {
    return i18n.t("apiErrors.sessionExpired");
  }

  if (response.status >= 500) {
    return i18n.t("apiErrors.serverError");
  }

  return i18n.t("apiErrors.requestFailed");
}

function withCacheBust(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}_=${Date.now()}`;
}

export async function apiRequest(path, { method = "GET", body, auth = true, community = true, timeoutMs = 25000, cache } = {}) {
  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const bypassHttpCache = cache === "no-store" || cache === "no-cache";
  if (bypassHttpCache) {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    headers["Pragma"] = "no-cache";
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
      const requestPath = bypassHttpCache && method === "GET" ? withCacheBust(path) : path;
      const response = await fetch(`${API_BASE_URL}${requestPath}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...(bypassHttpCache ? { cache: "no-store" } : {}),
      });
      return parseResponse(response);
    } catch (err) {
      if (isNetworkFailure(err)) {
        throw await transportError();
      }
      throw err;
    }
  })();

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      void transportError({ timedOut: true }).then(reject);
    }, timeoutMs);
  });

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}
