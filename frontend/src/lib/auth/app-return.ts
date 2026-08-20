const APP_RETURN_SCHEMES = /^(havena|exp|exps):\/\//i;
const EXPO_GO_ANDROID_PACKAGE = "host.exp.exponent";
const PRODUCTION_ANDROID_PACKAGE = "com.zsquare.havena";

function searchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/** Chrome on Android often ignores exp:// / havena:// links — use an intent URL instead. */
export function resolveMobileAppOpenUrl(returnTo: string): string {
  if (!isAndroidBrowser()) return returnTo;

  if (/^exp:\/\//i.test(returnTo)) {
    const target = returnTo.replace(/^exp:\/\//i, "");
    return `intent://${target}#Intent;scheme=exp;package=${EXPO_GO_ANDROID_PACKAGE};end`;
  }

  if (/^exps:\/\//i.test(returnTo)) {
    const target = returnTo.replace(/^exps:\/\//i, "");
    return `intent://${target}#Intent;scheme=exps;package=${EXPO_GO_ANDROID_PACKAGE};end`;
  }

  if (/^havena:\/\//i.test(returnTo)) {
    const target = returnTo.replace(/^havena:\/\//i, "");
    return `intent://${target}#Intent;scheme=havena;package=${PRODUCTION_ANDROID_PACKAGE};end`;
  }

  return returnTo;
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

function navigateToDeepLink(target: string) {
  // Anchor navigation survives stricter mobile browser custom-scheme policies.
  const anchor = document.createElement("a");
  anchor.href = target;
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Send the in-app browser back to Havena (exact deep link — matches openAuthSessionAsync). */
export function redirectToMobileAppIfPresent(): boolean {
  const url = readAppReturnTo();
  if (!url) return false;
  try {
    navigateToDeepLink(url);
  } catch {
    window.location.assign(url);
  }
  return true;
}

/** Manual “Open Havena” tap — uses Android intent URLs when needed. */
export function openMobileAppReturn(): boolean {
  const url = readAppReturnTo();
  if (!url) return false;

  const target = resolveMobileAppOpenUrl(url);
  try {
    navigateToDeepLink(target);
  } catch {
    window.location.assign(target);
  }
  return true;
}
