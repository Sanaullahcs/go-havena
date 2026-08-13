import { setSession, type WebUser } from "@/lib/auth/session";
import api from "@/lib/api/client";

const HANDOFF_PARAM = "handoff";

function mapHandoffUser(raw: Record<string, unknown>): WebUser {
  const memberships = (raw.memberships as WebUser["memberships"]) ?? [];
  const access = (raw.access as WebUser["access"]) ?? null;
  return {
    id: raw.id as number,
    email: raw.email as string | undefined,
    phone: raw.phone as string | undefined,
    name: raw.name as string | undefined,
    role: (raw.role as string | undefined) ?? "community_admin",
    community_admin_status: (raw.community_admin_status as string | null | undefined) ?? null,
    community_id: (access?.community_id ?? memberships[0]?.community_id) as number | undefined,
    memberships,
    profile: raw.profile as WebUser["profile"],
    access,
  };
}

export function readHandoffCodeFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get(HANDOFF_PARAM);
  return code?.trim() || null;
}

function stripHandoffFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(HANDOFF_PARAM)) return;
  url.searchParams.delete(HANDOFF_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, "", next);
}

/** If the URL has a one-time mobile→web code, exchange it for a session. */
export async function consumeWebHandoffIfPresent(): Promise<boolean> {
  const code = readHandoffCodeFromLocation();
  if (!code) return false;

  try {
    const res = await api.post("/v1/auth/web-handoff/consume", { code });
    const token = res.data?.token as string | undefined;
    const raw = (res.data?.user ?? {}) as Record<string, unknown>;
    if (!token) return false;
    setSession(token, mapHandoffUser(raw));
    stripHandoffFromUrl();
    return true;
  } catch {
    stripHandoffFromUrl();
    return false;
  }
}
