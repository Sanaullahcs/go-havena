const TOKEN_KEY = "nbr_web_token";
const USER_KEY = "nbr_web_user";

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
  if (partial.access) {
    next.access = { ...current.access, ...partial.access };
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
