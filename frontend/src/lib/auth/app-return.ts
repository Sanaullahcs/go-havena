const APP_RETURN_SCHEMES = /^(havena|exp|exps):\/\//i;

function searchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function readAppReturnTo(): string | null {
  const raw = searchParams().get("return_to")?.trim();
  if (!raw) return null;
  let url = raw;
  try {
    url = decodeURIComponent(raw);
  } catch {
    // already decoded
  }
  if (!APP_RETURN_SCHEMES.test(url)) return null;
  return url;
}

export function cameFromMobileApp(): boolean {
  const params = searchParams();
  return params.get("from") === "app" || Boolean(readAppReturnTo());
}

/** Query string to keep mobile return params when moving between billing pages. */
export function appReturnQuery(prefix: "?" | "&" = "?"): string {
  const params = searchParams();
  const next = new URLSearchParams();
  const from = params.get("from");
  const returnTo = params.get("return_to");
  if (from) next.set("from", from);
  if (returnTo) next.set("return_to", returnTo);
  const value = next.toString();
  return value ? `${prefix}${value}` : "";
}

export function withAppReturnParams(path: string): string {
  const [pathname, existing = ""] = path.split("?");
  const merged = new URLSearchParams(existing);
  const current = searchParams();
  const from = current.get("from");
  const returnTo = current.get("return_to");
  if (from && !merged.has("from")) merged.set("from", from);
  if (returnTo && !merged.has("return_to")) merged.set("return_to", returnTo);
  const query = merged.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Send the in-app browser back to Havena. Returns true when a deep link was used. */
export function redirectToMobileAppIfPresent(): boolean {
  const url = readAppReturnTo();
  if (!url) return false;
  window.location.assign(url);
  return true;
}
