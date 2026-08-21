/**
 * System admin, community admin, and resident each keep their own token.
 * A tab/window locks to one portal via sessionStorage so two browsers (or two
 * windows) can stay signed in as different roles without overwriting each other.
 */
export type SessionPortal = "system" | "community" | "resident";

const PORTAL_LOCK_KEY = "havena_web_portal";
const LEGACY_TOKEN_KEY = "nbr_web_token";
const LEGACY_USER_KEY = "nbr_web_user";

const SESSION_KEYS: Record<SessionPortal, { token: string; user: string }> = {
  system: { token: "havena_system_token", user: "havena_system_user" },
  community: { token: "havena_community_token", user: "havena_community_user" },
  resident: { token: "havena_resident_token", user: "havena_resident_user" },
};

const SYSTEM_PATH_PREFIXES = [
  "/system-login",
  "/admin/community-admins",
  "/admin/residents",
  "/admin/communities",
  "/admin/regions",
  "/admin/contact-messages",
  "/admin/wellness",
  "/admin/billing-plans",
  "/admin/billing-coupons",
  "/admin/referrals",
  "/admin/moderation",
  "/admin/analytics",
  "/admin/users",
  "/admin/community-requests",
];

const RESIDENT_PATH_PREFIXES = [
  "/resident-login",
  "/home",
  "/notices",
  "/feed",
  "/messages",
  "/wellness",
  "/marketplace",
  "/property",
  "/profile",
  "/support",
];

function pathStartsWith(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function portalFromUser(user?: WebUser | null): SessionPortal | null {
  if (!user?.role) return null;
  if (user.role === "system_admin" || user.role === "admin") return "system";
  if (user.role === "community_admin") return "community";
  if (user.role === "resident" || user.role === "guest") return "resident";
  return null;
}

function portalFromPath(pathname: string): SessionPortal | null {
  if (SYSTEM_PATH_PREFIXES.some((prefix) => pathStartsWith(pathname, prefix))) {
    return "system";
  }
  if (RESIDENT_PATH_PREFIXES.some((prefix) => pathStartsWith(pathname, prefix))) {
    return "resident";
  }
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/admin")
  ) {
    return "community";
  }
  return null;
}

function readPortalToken(portal: SessionPortal): string | null {
  return localStorage.getItem(SESSION_KEYS[portal].token);
}

function migrateLegacySession() {
  const token = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!token) return;

  let user: WebUser | null = null;
  const raw = localStorage.getItem(LEGACY_USER_KEY);
  try {
    user = raw ? (JSON.parse(raw) as WebUser) : null;
  } catch {
    user = null;
  }

  const portal = portalFromUser(user) ?? "community";
  if (!readPortalToken(portal)) {
    localStorage.setItem(SESSION_KEYS[portal].token, token);
    if (raw) localStorage.setItem(SESSION_KEYS[portal].user, raw);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

export function resolveSessionPortal(): SessionPortal {
  if (typeof window === "undefined") return "community";
  migrateLegacySession();

  const pathname = window.location.pathname;
  const pathHint = portalFromPath(pathname);
  let tabPortal: SessionPortal | null = null;
  try {
    const locked = sessionStorage.getItem(PORTAL_LOCK_KEY);
    if (locked === "system" || locked === "community" || locked === "resident") {
      tabPortal = locked;
    }
  } catch {
    tabPortal = null;
  }

  const lock = (portal: SessionPortal) => {
    try {
      sessionStorage.setItem(PORTAL_LOCK_KEY, portal);
    } catch {
      /* private mode */
    }
    return portal;
  };

  // Login / dedicated portals must not pick up the other role's token from localStorage.
  if (
    pathHint &&
    (pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/system-login") ||
      pathname.startsWith("/resident-login") ||
      pathHint === "system" ||
      pathHint === "resident")
  ) {
    return lock(pathHint);
  }

  if (tabPortal && readPortalToken(tabPortal)) return tabPortal;

  if (pathname === "/admin" || pathname === "/admin/") {
    if (readPortalToken("community") && !readPortalToken("system")) return lock("community");
    if (readPortalToken("system") && !readPortalToken("community")) return lock("system");
  }

  if (pathHint && readPortalToken(pathHint)) return lock(pathHint);

  return lock(pathHint ?? tabPortal ?? "community");
}

function lockPortal(portal: SessionPortal) {
  try {
    sessionStorage.setItem(PORTAL_LOCK_KEY, portal);
  } catch {
    /* private mode */
  }
}

export type CommunityAdminAccess = {
  platform_approved?: boolean;
  billing_complete?: boolean;
  can_use_dashboard?: boolean;
  can_use_mobile_app?: boolean;
  has_linked_community?: boolean;
  profile_complete?: boolean;
  community_id?: number | null;
  subscription_status?: string | null;
  plan_slug?: string | null;
  card_on_file?: boolean;
  trial_ends_at?: string | null;
  admin_transition?: boolean;
  leftover_ends_at?: string | null;
  has_leftover_service?: boolean;
  requires_replacement_card?: boolean;
  access_revoked?: boolean;
  next_step?: string;
  billing_url?: string;
  blocking_reasons?: string[];
};

export type WebUser = {
  id: number;
  email?: string;
  phone?: string;
  name?: string;
  role?: string;
  community_id?: number;
  community_admin_status?: string | null;
  memberships?: Array<{
    id: number;
    community_id: number;
    role: string;
    status: string;
    community?: { id: number; name: string; review_status?: string | null };
  }>;
  profile?: { display_name?: string; avatar?: string; avatar_url?: string };
  access?: CommunityAdminAccess | null;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return readPortalToken(resolveSessionPortal());
}

export function setSession(token: string, user?: WebUser) {
  const portal = portalFromUser(user) ?? resolveSessionPortal();
  localStorage.setItem(SESSION_KEYS[portal].token, token);
  if (user) localStorage.setItem(SESSION_KEYS[portal].user, JSON.stringify(user));
  lockPortal(portal);
}

export function updateUser(partial: Partial<WebUser>) {
  if (typeof window === "undefined") return;
  const portal = resolveSessionPortal();
  const token = readPortalToken(portal);
  const current = getUser();
  if (!token || !current) return;
  const next = { ...current, ...partial };
  if (partial.profile) {
    next.profile = { ...current.profile, ...partial.profile };
  }
  if (partial.access) {
    next.access = { ...current.access, ...partial.access };
  }
  const writePortal = portalFromUser(next) ?? portal;
  localStorage.setItem(SESSION_KEYS[writePortal].user, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("nbr-session-updated"));
}

export function getUser(): WebUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEYS[resolveSessionPortal()].user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  const portal = resolveSessionPortal();
  localStorage.removeItem(SESSION_KEYS[portal].token);
  localStorage.removeItem(SESSION_KEYS[portal].user);
  try {
    sessionStorage.removeItem(PORTAL_LOCK_KEY);
  } catch {
    /* private mode */
  }
}

export function isSystemAdminUser(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  return u?.role === "system_admin" || u?.role === "admin";
}

export function isCommunityAdminUser(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  return u?.role === "community_admin";
}

/** Full dashboard access: platform approval + billing (backend access flags preferred). */
export function canAccessCommunityDashboard(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  if (!u) return false;
  if (isSystemAdminUser(u)) return true;
  if (isCommunityAdminUser(u)) {
    if (typeof u.access?.can_use_dashboard === "boolean") {
      return u.access.can_use_dashboard;
    }
    return false;
  }
  return Boolean(getManagedCommunityId(u));
}

/** Routes a community admin may open before full access (setup + billing + wait screens). */
export function canAccessCommunityOnboarding(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  if (!u || !isCommunityAdminUser(u)) return false;
  if (u.community_admin_status === "rejected") return false;
  return true;
}

export function wasCommunityAdminRevoked(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  if (!u || u.community_admin_status !== "rejected") return false;
  if (u.access?.access_revoked || u.access?.blocking_reasons?.includes("admin_revoked")) {
    return true;
  }
  return (u.memberships ?? []).some(
    (m) =>
      m.role === "admin" &&
      (m.status === "approved" || m.status === "banned") &&
      (m.community?.review_status === "approved" || m.community?.review_status == null),
  );
}

export function communityAdminAccessBlockedCopy(user?: WebUser | null): { title: string; message: string } {
  if (wasCommunityAdminRevoked(user)) {
    return {
      title: "Access revoked",
      message:
        "Your community admin access was revoked after it had been approved. Your subscription has been canceled and you will not be charged again. Contact support if you have questions.",
    };
  }
  return {
    title: "Access unavailable",
    message: "Your community admin application was not approved. Contact support for help.",
  };
}

export function getCommunityAdminNextStep(user?: WebUser | null): string {
  const u = user ?? getUser();
  if (!u || !isCommunityAdminUser(u)) return "ready";
  return u.access?.next_step ?? "link_community";
}

/** Community admin still in setup / billing / approval — not full dashboard yet. */
export function isCommunityAdminOnboarding(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  if (!u || !isCommunityAdminUser(u)) return false;
  if (u.community_admin_status === "rejected") return false;
  return !canAccessCommunityDashboard(u);
}

export function getManagedCommunityId(user?: WebUser | null): number | undefined {
  const u = user ?? getUser();
  if (!u || isSystemAdminUser(u)) return undefined;

  if (u.access?.community_id) {
    return Number(u.access.community_id);
  }

  const approved = (u.memberships ?? []).find(
    (m) => m.status === "approved" && ["admin", "moderator"].includes(m.role),
  );
  if (approved?.community_id) return approved.community_id;

  const pending = (u.memberships ?? []).find(
    (m) => m.status === "pending" && m.role === "admin",
  );

  return pending?.community_id ?? u.community_id;
}
