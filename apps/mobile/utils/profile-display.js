import { API_BASE_URL } from "../constants/api-config";
import { resolveSeedMediaSource } from "../constants/seed-media";
import { formatDisplayEmail } from "./form-validation";
import { isGuestUser } from "../services/community-access";

function getPublicBase() {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
}

/** Private / dev hosts stored in DB that must be rewritten to the live API origin. */
function isRewritableDevHost(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "10.0.2.2") {
    return true;
  }
  if (/^192\.168\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
  return false;
}

/** Keep only the public disk path, e.g. `/storage/posts/abc.jpg`. */
export function extractStoragePath(url) {
  if (!url) return null;

  const value = String(url).trim().replace(/\/public(\/storage\/)/, "$1");
  const match = value.match(/\/storage\/.+/);
  // Only real storage paths — never treat external paths like `/300` (pravatar) as local media.
  return match ? match[0] : null;
}

/** Turn `/storage/...` paths into a full URL the app can load. */
export function resolveMediaUrl(path) {
  if (!path) return null;

  const publicBase = getPublicBase();
  const value = String(path).trim();
  if (!value) return null;

  if (/^(file|content|ph|assets-library):\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const storagePath = extractStoragePath(parsed.pathname);
      if (storagePath) {
        return `${publicBase}${storagePath}`;
      }

      if (isRewritableDevHost(parsed.hostname) && parsed.pathname) {
        const normalizedPath = parsed.pathname.replace(/\/public(\/storage\/)/, "$1");
        return `${publicBase}${normalizedPath}`;
      }

      return value;
    } catch {
      return value;
    }
  }

  const storagePath = extractStoragePath(value);
  if (storagePath) {
    return `${publicBase}${storagePath}`;
  }

  return `${publicBase}${value.startsWith("/") ? value : `/${value}`}`;
}

/** expo-image source with localtunnel bypass header when needed. */
export function mediaImageSource(uriOrSource) {
  if (!uriOrSource && uriOrSource !== 0) return null;

  // Metro asset module from require(...)
  if (typeof uriOrSource === "number") return uriOrSource;

  const seedLocal = resolveSeedMediaSource(uriOrSource);
  if (seedLocal != null) return seedLocal;

  if (typeof uriOrSource === "object" && !uriOrSource.uri) {
    return uriOrSource;
  }

  const uri = typeof uriOrSource === "string" ? uriOrSource : uriOrSource.uri;
  const resolved = resolveMediaUrl(uri);
  if (!resolved) return null;

  // Prefer bundled demo art whenever the path is a seed file (also covers rewritten hosts).
  const seedFromResolved = resolveSeedMediaSource(resolved);
  if (seedFromResolved != null) return seedFromResolved;

  const needsBypass =
    resolved.includes("loca.lt") || API_BASE_URL.includes("loca.lt");
  const needsNgrok =
    resolved.includes("ngrok-free.app") ||
    resolved.includes("ngrok.io") ||
    API_BASE_URL.includes("ngrok-free.app") ||
    API_BASE_URL.includes("ngrok.io");

  const base =
    typeof uriOrSource === "object"
      ? { ...uriOrSource, uri: resolved }
      : { uri: resolved };

  if (!needsBypass && !needsNgrok) return base;

  return {
    ...base,
    headers: {
      ...(base.headers ?? {}),
      ...(needsBypass ? { "Bypass-Tunnel-Reminder": "true" } : {}),
      ...(needsNgrok ? { "ngrok-skip-browser-warning": "true" } : {}),
    },
  };
}

export function getRoleLabel(user) {
  if (!user) return "Resident";
  if (isGuestUser(user)) return "Guest";
  if (user.role === "community_admin" || user.role === "admin") return "Community admin";
  return "Resident";
}

const PLACEHOLDER_DISPLAY_NAMES = new Set(["My Profile", "Neighbor"]);

/** True when the API still has the default placeholder name — show empty in profile forms. */
export function isPlaceholderDisplayName(name) {
  const trimmed = String(name ?? "").trim();
  return !trimmed || PLACEHOLDER_DISPLAY_NAMES.has(trimmed);
}

/** Normalize API `/me` payload or cached session user for UI. */
export function getProfileFields(user) {
  if (!user) {
    return {
      displayName: "My Profile",
      avatarUrl: null,
      utilityBillUrl: null,
      unitNumber: null,
      communityName: "My Community",
      regionId: null,
      regionTitle: null,
      bio: "",
      email: "",
      displayEmail: null,
      role: "resident",
    };
  }

  const profile = user.profile ?? user;
  const rawName = profile.display_name || user.name || "My Profile";

  return {
    displayName: isPlaceholderDisplayName(rawName) ? "My Profile" : rawName,
    avatarUrl: resolveMediaUrl(profile.avatar_url ?? user.avatar_url),
    utilityBillUrl: resolveMediaUrl(profile.utility_bill_url ?? user.utility_bill_url),
    unitNumber: profile.unit_number ?? user.unit_number ?? null,
    communityName:
      user.memberships?.find((m) => m.status === "approved")?.community?.name ??
      user.memberships?.[0]?.community?.name ??
      "My Community",
    regionId: profile.region_id ?? profile.region?.id ?? null,
    regionTitle: profile.region?.title ?? null,
    bio: profile.bio ?? user.bio ?? "",
    email: user.email ?? "",
    displayEmail: formatDisplayEmail(user.email),
    role: isGuestUser(user) ? "guest" : (user.role ?? "resident"),
  };
}

export function getProfileInitial(name) {
  const trimmed = String(name ?? "").trim();
  return trimmed.charAt(0).toUpperCase() || "?";
}

/** Up to two initials from a display name (e.g. "Jane Doe" → "JD"). */
export function getDisplayInitials(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}
