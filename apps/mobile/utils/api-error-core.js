function isHtmlOrServerNoise(message) {
  if (!message) return false;
  const text = String(message);
  return (
    text.includes("<!DOCTYPE") ||
    text.includes("<br") ||
    text.includes("<b>") ||
    /Deprecated:/i.test(text) ||
    text.includes("vendor/laravel")
  );
}

function isDatabaseOrSqlLeak(message) {
  if (!message) return false;
  const text = String(message);
  return (
    /SQLSTATE\[/i.test(text) ||
    /Connection: mysql/i.test(text) ||
    /Connection refused/i.test(text) ||
    /Base table or view not found/i.test(text) ||
    /Integrity constraint violation/i.test(text) ||
    /PDOException/i.test(text) ||
    /Illuminate\\Database/i.test(text) ||
    /SQL:\s*select/i.test(text) ||
    /SQL:\s*insert/i.test(text) ||
    /SQL:\s*update/i.test(text) ||
    /SQL:\s*delete/i.test(text)
  );
}

/** True when a message looks like a raw connectivity / DNS / socket failure. */
export function looksLikeNetworkFailureMessage(message) {
  if (!message) return false;
  const text = String(message).toLowerCase();
  return (
    text.includes("network request failed") ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("could not connect") ||
    text.includes("failed to connect") ||
    text.includes("connection refused") ||
    text.includes("connection reset") ||
    text.includes("connection timed out") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("enotfound") ||
    text.includes("econnrefused") ||
    text.includes("econnreset") ||
    text.includes("eai_again") ||
    text.includes("socket") ||
    text.includes("dns") ||
    text.includes("unreachable") ||
    text.includes("offline") ||
    text.includes("internet connection appears to be offline") ||
    text.includes("fetch request has been cancelled") ||
    text.includes("network is unreachable") ||
    text.includes("no address associated") ||
    text.includes("name resolution") ||
    text.includes("getaddrinfo") ||
    text.includes("unable to resolve host") ||
    text.includes("unknown host") ||
    /failed to connect to .+:\d+/i.test(String(message))
  );
}

/** Device-level offline text, not a failure to reach one server. */
export function isDeviceOfflineMessage(message) {
  if (!message) return false;
  const text = String(message).toLowerCase();
  return (
    text.includes("internet connection appears to be offline") ||
    text.includes("not connected to the internet") ||
    text.includes("network is unreachable")
  );
}

/**
 * Detect offline / timeout / DNS / connection failures for UI fallbacks.
 * Does not treat successful ApiError business codes as network failures.
 */
export function isNetworkLikeError(error) {
  if (!error) return false;

  const code = getApiErrorCode(error);
  if (code === "NETWORK_ERROR") return true;
  if (code) return false;
  if (error.status && error.status !== 0) return false;

  const causeMessage = error?.cause?.message ?? error?.cause;
  return isDeviceOfflineMessage(error?.message) || isDeviceOfflineMessage(causeMessage);
}

const OFFLINE_USER_MESSAGE = "Please check your internet connection and try again.";
const SERVER_UNREACHABLE_MESSAGE = "The server encountered an error. Please try again in a moment.";
const TIMEOUT_USER_MESSAGE = "Connection timed out. Check your network and try again.";

function friendlyValidationMessage(message) {
  if (!message) return message;
  const text = String(message).trim();

  if (isDatabaseOrSqlLeak(text) || isHtmlOrServerNoise(text)) {
    return "We could not complete that request. Please try again in a moment.";
  }

  if (/selected region id is invalid/i.test(text)) {
    return "That region is no longer available. Pull to refresh and choose again.";
  }

  if (/failed to upload/i.test(text)) {
    return "The file could not be uploaded. Please take or choose the photo again, then retry.";
  }

  if (looksLikeNetworkFailureMessage(text)) {
    return SERVER_UNREACHABLE_MESSAGE;
  }

  return text;
}

/** Map Laravel validation / API errors to user-facing messages. */
export function getApiErrorMessage(error, field) {
  const code = getApiErrorCode(error);
  if (code === "NETWORK_ERROR" || isNetworkLikeError(error)) {
    return OFFLINE_USER_MESSAGE;
  }
  if (code === "TIMEOUT") {
    return TIMEOUT_USER_MESSAGE;
  }
  if (code === "SERVER_UNREACHABLE") {
    return SERVER_UNREACHABLE_MESSAGE;
  }

  if (field && error?.errors?.[field]?.[0]) {
    return friendlyValidationMessage(error.errors[field][0]);
  }

  const firstField = error?.errors && Object.keys(error.errors)[0];
  if (firstField && error.errors[firstField]?.[0]) {
    return friendlyValidationMessage(error.errors[firstField][0]);
  }

  const message = error?.message;
  if (message && isDatabaseOrSqlLeak(message)) {
    if (error?.status >= 500 || !error?.status) {
      return "We could not reach the local database. Make sure MySQL is running, then try again.";
    }
    return "We could not complete that request. Please try again in a moment.";
  }

  if (message && !isHtmlOrServerNoise(message)) {
    return friendlyValidationMessage(message);
  }

  if (error?.status === 401) {
    return "Your session expired. Please sign in again.";
  }

  if (error?.status === 422) {
    return "Please check your selection and try again.";
  }

  if (error?.status >= 500) {
    return "The server encountered an error. Please try again in a moment.";
  }

  return "Something went wrong. Please try again.";
}

export function getApiErrorCode(error) {
  if (!error) return null;
  if (typeof error.code === "string" && error.code) return error.code;
  if (typeof error?.response?.data?.code === "string") return error.response.data.code;
  return null;
}
