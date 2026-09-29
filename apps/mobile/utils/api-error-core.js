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

  if (
    /fetch failed/i.test(text) ||
    /could not connect/i.test(text) ||
    /network request failed/i.test(text) ||
    /failed to fetch/i.test(text)
  ) {
    return "Could not reach the server. Check your connection and try again.";
  }

  return text;
}

/** Map Laravel validation / API errors to user-facing messages. */
export function getApiErrorMessage(error, field) {
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
