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
  "/admin/request-demo",
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
  "/payments",
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

  if (pathname.startsWith("/system-login") || pathHint === "system") {
    return lock("system");
  }
  if (pathname.startsWith("/resident-login")) {
    return lock("resident");
  }
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return lock("community");
  }

  // Community Admin URLs must keep the CA session. A leftover System Admin or
  // Resident tab lock must not steal /admin after the mode-switch work.
  if (pathHint === "community") {
    if (readPortalToken("community")) return lock("community");
    if (pathname.startsWith("/admin") && readPortalToken("system")) return lock("system");
  }

  if (pathHint === "resident" && readPortalToken("resident")) {
    return lock("resident");
  }

  if (tabPortal && readPortalToken(tabPortal)) return tabPortal;

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
  billing_exempt?: boolean;
  can_use_dashboard?: boolean;
  can_use_mobile_app?: boolean;
  has_linked_community?: boolean;
  profile_complete?: boolean;
  community_id?: number | null;
  subscription_status?: string | null;
  plan_slug?: string | null;
  card_on_file?: boolean;
  country_code?: string | null;
  /** ISO-4217 code the community's money is displayed in. */
  currency?: string | null;
  plaid_available?: boolean;
  trial_ends_at?: string | null;
  admin_transition?: boolean;
  leftover_ends_at?: string | null;
  has_leftover_service?: boolean;
  requires_replacement_card?: boolean;
  access_revoked?: boolean;
  next_step?: string;
  billing_url?: string;
  resident_features_configured?: boolean;
  blocking_reasons?: string[];
};

export type WebUser = {
  id: number;
  email?: string;
  phone?: string;
  name?: string;
  role?: string;
  status?: string | null;
  community_id?: number;
  community_admin_status?: string | null;
  /** Currency of the community the user is acting in. See lib/money.ts. */
  currency?: string | null;
  memberships?: Array<{
    id: number;
    community_id: number;
    role: string;
    status: string;
    community?: {
      id: number;
      name: string;
      review_status?: string | null;
      currency?: string | null;
    };
  }>;
  profile?: { display_name?: string; avatar?: string; avatar_url?: string };
  access?: CommunityAdminAccess | null;
  resident_features?: {
    configured?: boolean;
    features?: Record<string, boolean>;
    catalog?: Array<{
      key: string;
      label: string;
      description: string;
      group: string;
      group_label: string;
      enabled: boolean;
      disabled_by?: "system_admin" | "community_admin" | null;
    }>;
  } | null;
  active_context?: "community_admin" | "resident" | string | null;
  active_mode?: "community_admin" | "resident" | string | null;
  active_context_community_id?: number | null;
  can_switch_modes?: boolean;
  can_use_admin_mode?: boolean;
  can_use_resident_mode?: boolean;
  resident_mode_communities?: Array<{ id: number; name: string }>;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return readPortalToken(resolveSessionPortal());
}

export function isResidentMode(user?: WebUser | null): boolean {
  const u = user ?? (typeof window === "undefined" ? null : getUser());
  const mode = u?.active_mode ?? u?.active_context;
  return u?.role === "community_admin" && mode === "resident";
}

export function canUseResidentMode(user?: WebUser | null): boolean {
  return canSwitchModes(user);
}

/** Account is an approved Community Admin and may switch Admin ↔ Resident. */
export function canSwitchModes(user?: WebUser | null): boolean {
  const u = user ?? (typeof window === "undefined" ? null : getUser());
  if (!u || u.role !== "community_admin") return false;
  return Boolean(u.can_switch_modes ?? u.can_use_admin_mode ?? u.can_use_resident_mode);
}

export function canSwitchToResidentMode(user?: WebUser | null): boolean {
  return canSwitchModes(user) && !isResidentMode(user);
}

export function canSwitchToAdminMode(user?: WebUser | null): boolean {
  return canSwitchModes(user) && isResidentMode(user);
}

export function applyPortalForActiveContext(token: string, user: WebUser) {
  const portal: SessionPortal = isResidentMode(user) ? "resident" : (portalFromUser(user) ?? "community");
  writePortalSession(portal, token, user);
  if (user.role === "community_admin") {
    const other: SessionPortal = portal === "resident" ? "community" : "resident";
    writePortalSession(other, token, user);
  }
  lockPortal(portal);
  window.dispatchEvent(new CustomEvent("nbr-session-updated"));
}

export function setSession(token: string, user?: WebUser) {
  if (user?.role === "community_admin") {
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const onResidentPath = portalFromPath(pathname) === "resident";
    if (isResidentMode(user) && onResidentPath) {
      applyPortalForActiveContext(token, user);
      return;
    }
    writePortalSession("community", token, user);
    lockPortal("community");
    window.dispatchEvent(new CustomEvent("nbr-session-updated"));
    return;
  }
  const portal = portalFromUser(user) ?? resolveSessionPortal();
  localStorage.setItem(SESSION_KEYS[portal].token, token);
  if (user) {
    localStorage.setItem(SESSION_KEYS[portal].user, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent("nbr-session-updated"));
  }
  lockPortal(portal);
}

function writePortalSession(portal: SessionPortal, token: string, user: WebUser) {
  localStorage.setItem(SESSION_KEYS[portal].token, token);
  localStorage.setItem(SESSION_KEYS[portal].user, JSON.stringify(user));
}

export function updateUser(partial: Partial<WebUser>, options?: { silent?: boolean }) {
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
  const serialized = JSON.stringify(next);
  localStorage.setItem(SESSION_KEYS[portal].user, JSON.stringify(next));
  if (next.role === "community_admin") {
    const other: SessionPortal = portal === "resident" ? "community" : "resident";
    if (readPortalToken(other)) {
      localStorage.setItem(SESSION_KEYS[other].user, serialized);
    }
  }
  if (!options?.silent) {
    window.dispatchEvent(new CustomEvent("nbr-session-updated"));
  }
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

  const step = u.access?.next_step ?? "link_community";
  if (
    step !== "complete_profile" &&
    step !== "link_community" &&
    u.access?.profile_complete === false &&
    u.access?.has_linked_community
  ) {
    return "complete_profile";
  }

  return step;
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

  if (u.active_context_community_id) {
    return Number(u.active_context_community_id);
  }

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

/** True when the managed community's region country is Pakistan. */
export function isPakistanCommunityRegion(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  const code = String(u?.access?.country_code ?? "").trim().toUpperCase();
  return code === "PK";
}
