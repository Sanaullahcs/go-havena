const TOKEN_KEY = "nbr_web_token";
const USER_KEY = "nbr_web_user";

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
    community?: { id: number; name: string };
  }>;
  profile?: { display_name?: string; avatar?: string; avatar_url?: string };
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user?: WebUser) {
  localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateUser(partial: Partial<WebUser>) {
  if (typeof window === "undefined") return;
  const token = getToken();
  const current = getUser();
  if (!token || !current) return;
  const next = { ...current, ...partial };
  if (partial.profile) {
    next.profile = { ...current.profile, ...partial.profile };
  }
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("nbr-session-updated"));
}

export function getUser(): WebUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isSystemAdminUser(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  return u?.role === "system_admin" || u?.role === "admin";
}

export function isCommunityAdminUser(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  return u?.role === "community_admin";
}

/** Approved community admin (or non–community-admin with an approved admin membership). */
export function canAccessCommunityDashboard(user?: WebUser | null): boolean {
  const u = user ?? getUser();
  if (!u) return false;
  if (isSystemAdminUser(u)) return true;
  if (isCommunityAdminUser(u)) {
    return u.community_admin_status === "approved" && Boolean(getManagedCommunityId(u));
  }
  return Boolean(getManagedCommunityId(u));
}

export function getManagedCommunityId(user?: WebUser | null): number | undefined {
  const u = user ?? getUser();
  if (!u || isSystemAdminUser(u)) return undefined;

  const membership = (u.memberships ?? []).find(
    (m) => m.status === "approved" && ["admin", "moderator"].includes(m.role),
  );

  return membership?.community_id;
}
