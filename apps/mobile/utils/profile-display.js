import { API_BASE_URL } from "../constants/api-config";
import { resolveSeedMediaSource } from "../constants/seed-media";
import { formatDisplayEmail } from "./form-validation";
import { toDisplayPhone } from "./phone";
import { currentCommunityId, isGuestUser, isResidentMode } from "../services/community-access";
import i18n from "../i18n";

function getPublicBase() {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
}

function getPublicBaseParts() {
  try {
    return new URL(getPublicBase());
  } catch {
    return null;
  }
}

/** True when two dev URLs point at the same host + port. */
function isSameDevOrigin(urlString) {
  const base = getPublicBaseParts();
  if (!base) return false;
  try {
    const parsed = new URL(urlString);
    const basePort = base.port || (base.protocol === "https:" ? "443" : "80");
    const parsedPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return parsed.hostname === base.hostname && parsedPort === basePort;
  } catch {
    return false;
  }
}

/** Ensure LAN API URLs include the dev server port when missing. */
function ensureDevServerPort(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.port || !isRewritableDevHost(parsed.hostname)) {
      return urlString;
    }
    const base = getPublicBaseParts();
    if (base?.port) {
      parsed.port = base.port;
      return parsed.toString();
    }
    if (parsed.protocol === "http:") {
      parsed.port = "8000";
      return parsed.toString();
    }
  } catch {
    // fall through
  }
  return urlString;
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

/** expo-image source: bundled seed art when available, otherwise a loadable URI. */
export function resolveAppImageSource(path, { allowBundledSeed = true } = {}) {
  if (path == null || path === "") return null;
  if (typeof path === "number") return path;

  if (allowBundledSeed) {
    const seed = resolveSeedMediaSource(path);
    if (seed != null) return seed;
  }

  const resolved = resolveMediaUrl(path);
  if (!resolved) return null;

  if (allowBundledSeed) {
    const seedFromResolved = resolveSeedMediaSource(resolved);
    if (seedFromResolved != null) return seedFromResolved;
  }

  if (typeof resolved === "number") return resolved;

  const needsBypass =
    resolved.includes("loca.lt") || API_BASE_URL.includes("loca.lt");
  const needsNgrok =
    resolved.includes("ngrok-free.app") ||
    resolved.includes("ngrok.io") ||
    API_BASE_URL.includes("ngrok-free.app") ||
    API_BASE_URL.includes("ngrok.io");

  const base = { uri: resolved };
  if (!needsBypass && !needsNgrok) return base;

  return {
    ...base,
    headers: {
      ...(needsBypass ? { "Bypass-Tunnel-Reminder": "true" } : {}),
      ...(needsNgrok ? { "ngrok-skip-browser-warning": "true" } : {}),
    },
  };
}

/** Turn `/storage/...` paths into a full URL the app can load. */
export function resolveMediaUrl(path) {
  if (!path) return null;

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
        if (isSameDevOrigin(value)) {
          return ensureDevServerPort(value);
        }
        return `${getPublicBase()}${storagePath}`;
      }

      if (isRewritableDevHost(parsed.hostname) && parsed.pathname) {
        const normalizedPath = parsed.pathname.replace(/\/public(\/storage\/)/, "$1");
        return `${getPublicBase()}${normalizedPath}`;
      }

      return value;
    } catch {
      return value;
    }
  }

  const storagePath = extractStoragePath(value);
  if (storagePath) {
    return `${getPublicBase()}${storagePath}`;
  }

  return `${getPublicBase()}${value.startsWith("/") ? value : `/${value}`}`;
}

/** expo-image source with localtunnel bypass header when needed. */
export function mediaImageSource(uriOrSource) {
  if (!uriOrSource && uriOrSource !== 0) return null;

  // Metro asset module from require(...)
  if (typeof uriOrSource === "number") return uriOrSource;

  if (typeof uriOrSource === "object" && !uriOrSource.uri) {
    return uriOrSource;
  }

  return resolveAppImageSource(
    typeof uriOrSource === "string" ? uriOrSource : uriOrSource.uri,
  );
}

export function getRoleLabel(user) {
  if (!user) return i18n.t("profile.roles.resident");
  if (isGuestUser(user)) return i18n.t("profile.roles.guest");
  if (isResidentMode(user)) return i18n.t("profile.roles.resident");
  if (user.role === "community_admin" || user.role === "admin") return i18n.t("profile.roles.admin");
  return i18n.t("profile.roles.resident");
}

const PLACEHOLDER_DISPLAY_NAMES = new Set([
  "Profile",
  "My Profile",
  "Neighbor",
  "Complete Your Profile",
  "Complete your profile",
  i18n.t("profile.title"),
  i18n.t("onboarding.completeProfile"),
  i18n.t("onboarding.profileStep"),
]);

function isPhoneLikeLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (raw.toLowerCase().includes("@phone.havena.local")) return true;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  const compact = raw.replace(/[\s().+-]/g, "");
  return compact === digits || compact === `+${digits}`;
}

/** True when the API still has the default placeholder name — show empty in profile forms. */
export function isPlaceholderDisplayName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_DISPLAY_NAMES.has(trimmed)) return true;
  if (isPhoneLikeLabel(trimmed)) return true;
  return /^profile$/i.test(trimmed);
}

/** System-dashboard defaults for community admins — treat as unset on complete-profile. */
const PLACEHOLDER_UNIT_NUMBERS = new Set(["office", "management office"]);
const PLACEHOLDER_RESIDENCE_TYPES = new Set(["management", "office"]);

export function isPlaceholderUnitNumber(unit) {
  const trimmed = String(unit ?? "").trim();
  if (!trimmed) return true;
  return PLACEHOLDER_UNIT_NUMBERS.has(trimmed.toLowerCase());
}

export function isPlaceholderResidenceType(type) {
  const trimmed = String(type ?? "").trim();
  if (!trimmed) return true;
  if (trimmed === "homeowner" || trimmed === "tenant") return false;
  return PLACEHOLDER_RESIDENCE_TYPES.has(trimmed.toLowerCase());
}

/** Normalize API `/me` payload or cached session user for UI. */
export function getProfileFields(user, preferredCommunityId) {
  if (!user) {
    return {
      displayName: "",
      avatarUrl: null,
      utilityBillUrl: null,
      unitNumber: null,
      officeAddress: null,
      communityName: i18n.t("community.myCommunity"),
      regionId: null,
      regionTitle: null,
      bio: "",
      email: "",
      displayEmail: null,
      displayPhone: "",
      contactLine: "",
      role: "resident",
    };
  }

  const profile = user.profile ?? user;
  const rawName = profile.display_name || user.name || "";

  return {
    displayName: isPlaceholderDisplayName(rawName) ? "" : rawName,
    avatarUrl: resolveMediaUrl(profile.avatar_url ?? user.avatar_url),
    utilityBillUrl: resolveMediaUrl(profile.utility_bill_url ?? user.utility_bill_url),
    unitNumber: profile.unit_number ?? user.unit_number ?? null,
    officeAddress: profile.office_address ?? user.office_address ?? null,
    communityName: (() => {
      const memberships = user.memberships ?? [];
      const approved = memberships.filter((m) => m.status === "approved");
      const preferredId = preferredCommunityId ?? currentCommunityId(user);
      const preferred = preferredId
        ? approved.find((m) => String(m.community_id) === String(preferredId))
        : null;
      return (
        preferred?.community?.name ??
        approved[0]?.community?.name ??
        memberships[0]?.community?.name ??
        i18n.t("community.myCommunity")
      );
    })(),
    regionId: profile.region_id ?? profile.region?.id ?? null,
    regionTitle: profile.region?.title ?? null,
    bio: profile.bio ?? user.bio ?? "",
    email: user.email ?? "",
    displayEmail: formatDisplayEmail(user.email),
    displayPhone: toDisplayPhone(user.phone || user.email) || "",
    contactLine: formatDisplayEmail(user.email) || toDisplayPhone(user.phone || user.email) || "",
    role: isGuestUser(user) ? "guest" : (isResidentMode(user) ? "resident" : (user.role ?? "resident")),
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
