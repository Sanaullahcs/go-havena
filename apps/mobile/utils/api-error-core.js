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

function friendlyValidationMessage(message) {
  if (!message) return message;
  const text = String(message).trim();

  if (/selected region id is invalid/i.test(text)) {
    return "That region is no longer available. Pull to refresh and choose again.";
  }

  if (/failed to upload/i.test(text)) {
    return "The file could not be uploaded. Please take or choose the photo again, then retry.";
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
  return error?.code || null;
}
