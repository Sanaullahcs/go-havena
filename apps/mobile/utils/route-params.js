/** Expo Router params can be string | string[]; normalize to a single string. */
export function paramString(value, fallback = "") {
  if (value == null) return fallback;
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return String(value);
}

/** Preserve E.164 "+" when passing phone numbers through navigation params. */
export function encodeRoutePhone(e164) {
  const phone = String(e164 ?? "").trim();
  if (!phone) return "";
  return encodeURIComponent(phone);
}

export function decodeRoutePhone(value) {
  const raw = paramString(value).trim();
  if (!raw) return "";

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function encodeRouteEmail(email) {
  return encodeRoutePhone(email);
}

export function decodeRouteEmail(value) {
  return decodeRoutePhone(value).trim().toLowerCase();
}
