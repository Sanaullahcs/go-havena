import axios from "axios";
import api, { ApiError } from "./client";
import { parseAccountBlockFromResponse } from "@/lib/auth/account-block";
import type { CommunityAdminAccess } from "@/lib/auth/session";
import { normalizeReferralCode } from "@/lib/auth/referral-storage";

export type AuthUser = {
  id: number;
  email?: string;
  phone?: string;
  name?: string;
  role?: string;
  community_admin_status?: string | null;
  community_id?: number;
  memberships?: Array<{
    id: number;
    community_id: number;
    role: string;
    status: string;
    community?: { id: number; name: string };
  }>;
  profile?: { display_name?: string; avatar_url?: string; unit_number?: string };
  access?: CommunityAdminAccess | null;
};

function mapAuthUser(raw: Record<string, unknown>, fallback?: Partial<AuthUser>): AuthUser {
  const memberships = (raw?.memberships as AuthUser["memberships"]) ?? [];
  const approved = memberships.find((m) => m.status === "approved");
  const pendingAdmin = memberships.find((m) => m.status === "pending" && m.role === "admin");
  const access = (raw?.access as CommunityAdminAccess | undefined) ?? null;
  const communityId =
    access?.community_id ??
    approved?.community_id ??
    pendingAdmin?.community_id ??
    memberships[0]?.community_id ??
    undefined;

  return {
    id: raw?.id as number,
    email: (raw?.email as string) ?? fallback?.email,
    phone: (raw?.phone as string) ?? fallback?.phone,
    name: raw?.name as string | undefined,
    role: (raw?.role as string) ?? fallback?.role ?? "resident",
    community_admin_status: (raw?.community_admin_status as string | null | undefined) ?? null,
    community_id: communityId ? Number(communityId) : undefined,
    memberships,
    profile: raw?.profile as AuthUser["profile"],
    access,
  };
}

function throwAuthError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    const errors = data?.errors as Record<string, string[]> | undefined;
    const fieldMsg = errors?.email?.[0] ?? errors?.phone?.[0] ?? errors?.code?.[0] ?? errors?.referral_code?.[0];
    const msg = fieldMsg ?? (typeof data?.message === "string" ? data.message : "Request failed.");
    const block = parseAccountBlockFromResponse(data);
    const nested = data?.data as Record<string, unknown> | undefined;
    const code =
      typeof data?.code === "string"
        ? data.code
        : typeof nested?.code === "string"
          ? nested.code
          : undefined;
    throw new ApiError(msg, err.response?.status ?? 500, {
      code,
      block: block ?? undefined,
      retryAfterSeconds:
        typeof data?.retry_after_seconds === "number" ? data.retry_after_seconds : undefined,
      rateLimit: data?.rate_limit,
    });
  }
  throw err;
}

export async function loginWithEmail(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  try {
    const res = await api.post("/v1/auth/login", { email, password });
    const data = res.data;
    const token = data.token ?? data.access_token;
    const raw = data.user ?? data.data;
    const user = mapAuthUser(raw ?? {}, { email });
    if (!token) throw new ApiError("Login failed — no token returned.");
    return { token, user };
  } catch (err) {
    throwAuthError(err);
  }
}

export type CommunityAdminOtpIntent = "login" | "signup";

/**
 * Community-admin OTP request.
 * - mode "auto": try login first; unknown emails fall back to signup
 * - mode "signup": force signup (register page)
 * - mode "login": login only
 */
function otpRequestPayload(data: unknown): {
  rate_limit: unknown;
  expires_at: string | null;
  expires_in_seconds: number | null;
} {
  if (!data || typeof data !== "object") {
    return { rate_limit: null, expires_at: null, expires_in_seconds: null };
  }
  const record = data as {
    data?: { rate_limit?: unknown; expires_at?: unknown; expires_in_seconds?: unknown };
  };
  const rawSeconds = record.data?.expires_in_seconds;
  const expiresInSeconds =
    typeof rawSeconds === "number" && Number.isFinite(rawSeconds)
      ? Math.max(0, Math.ceil(rawSeconds))
      : typeof rawSeconds === "string" && rawSeconds.trim() !== "" && Number.isFinite(Number(rawSeconds))
        ? Math.max(0, Math.ceil(Number(rawSeconds)))
        : null;
  return {
    rate_limit: record.data?.rate_limit ?? null,
    expires_at: typeof record.data?.expires_at === "string" ? record.data.expires_at : null,
    expires_in_seconds: expiresInSeconds,
  };
}

function otpRequestRateLimit(data: unknown): unknown {
  return otpRequestPayload(data).rate_limit;
}

export async function requestCommunityAdminOtp(
  email: string,
  mode: "auto" | "login" | "signup" = "auto",
): Promise<{
  intent: CommunityAdminOtpIntent;
  rate_limit: unknown;
  expires_at: string | null;
  expires_in_seconds: number | null;
}> {
  if (mode === "signup") {
    try {
      const res = await api.post("/v1/auth/otp/request", {
        email,
        intent: "signup",
        portal: "community_admin_dashboard",
      });
      return { intent: "signup", ...otpRequestPayload(res.data) };
    } catch (err) {
      throwAuthError(err);
    }
  }

  try {
    const res = await api.post("/v1/auth/otp/request", {
      email,
      intent: "login",
      portal: "community_admin_dashboard",
    });
    return { intent: "login", ...otpRequestPayload(res.data) };
  } catch (err) {
    if (
      mode === "auto" &&
      axios.isAxiosError(err) &&
      err.response?.data?.code === "ACCOUNT_NOT_FOUND_USE_SIGNUP"
    ) {
      try {
        const res = await api.post("/v1/auth/otp/request", {
          email,
          intent: "signup",
          portal: "community_admin_dashboard",
        });
        return { intent: "signup", ...otpRequestPayload(res.data) };
      } catch (signupErr) {
        throwAuthError(signupErr);
      }
    }
    throwAuthError(err);
  }
}

export type CommunityAdminOtpChallenge = {
  active: boolean;
  email: string | null;
  expires_at: string | null;
  expires_in_seconds: number;
  rate_limit: unknown;
};

export async function getCommunityAdminSignupOtpChallenge(
  email: string,
): Promise<CommunityAdminOtpChallenge> {
  try {
    const res = await api.get("/v1/auth/otp/challenge", {
      params: {
        email,
        intent: "signup",
        portal: "community_admin_dashboard",
      },
    });
    const data = (res.data as { data?: Record<string, unknown> } | undefined)?.data ?? {};
    return {
      active: Boolean(data.active),
      email: typeof data.email === "string" ? data.email : null,
      expires_at: typeof data.expires_at === "string" ? data.expires_at : null,
      expires_in_seconds: Math.max(0, Number(data.expires_in_seconds ?? 0)),
      rate_limit: data.rate_limit ?? null,
    };
  } catch (err) {
    throwAuthError(err);
  }
}

export async function verifyCommunityAdminOtp(
  email: string,
  code: string,
  intent: CommunityAdminOtpIntent = "login",
  referralCode?: string | null,
): Promise<{ token: string; user: AuthUser; intent: CommunityAdminOtpIntent }> {
  try {
    const cleanReferral = normalizeReferralCode(referralCode);
    const res = await api.post("/v1/auth/otp/verify", {
      email,
      code,
      intent,
      portal: "community_admin_dashboard",
      ...(intent === "signup" ? { role: "admin" as const } : {}),
      ...(cleanReferral ? { referral_code: cleanReferral } : {}),
    });
    const data = res.data;
    const token = data.token;
    const raw = data.user ?? data.data;
    const user = mapAuthUser(raw ?? {}, { email });
    if (!token) throw new ApiError("Login failed — no token returned.");
    return { token, user, intent };
  } catch (err) {
    throwAuthError(err);
  }
}

export async function requestResidentOtp(
  email: string,
): Promise<{ rate_limit: unknown; expires_at: string | null; expires_in_seconds: number | null }> {
  try {
    const res = await api.post("/v1/auth/otp/request", {
      email,
      intent: "login",
      portal: "resident_portal",
    });
    return otpRequestPayload(res.data);
  } catch (err) {
    throwAuthError(err);
  }
}

export async function verifyResidentOtp(
  email: string,
  code: string,
): Promise<{ token: string; user: AuthUser }> {
  try {
    const res = await api.post("/v1/auth/otp/verify", {
      email,
      code,
      intent: "login",
      portal: "resident_portal",
    });
    const data = res.data;
    const token = data.token;
    const raw = data.user ?? data.data;
    const user = mapAuthUser(raw ?? {}, { email });
    if (!token) throw new ApiError("Login failed — no token returned.");
    return { token, user };
  } catch (err) {
    throwAuthError(err);
  }
}

export async function requestSignupOtp(email: string): Promise<{ rate_limit: unknown }> {
  try {
    const res = await api.post("/v1/auth/otp/request", {
      email,
      intent: "signup",
    });
    return { rate_limit: otpRequestRateLimit(res.data) };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as {
        message?: string;
        errors?: Record<string, string[]>;
      } | undefined;
      const fieldMsg = data?.errors?.email?.[0];
      const msg = fieldMsg ?? data?.message ?? "Unable to send verification code.";
      throw new ApiError(msg, err.response?.status ?? 500);
    }
    throw err;
  }
}

export async function verifySignupOtp(
  email: string,
  code: string,
  role: "admin" | "resident",
): Promise<{ token: string; user: AuthUser }> {
  try {
    const res = await api.post("/v1/auth/otp/verify", {
      email,
      code,
      intent: "signup",
      role,
    });
    const data = res.data;
    const token = data.token;
    const raw = data.user ?? data.data;
    const user = mapAuthUser(raw ?? {}, { email });
    if (!token) throw new ApiError("Sign up failed — no token returned.");
    return { token, user };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as {
        message?: string;
        errors?: Record<string, string[]>;
      } | undefined;
      const fieldMsg = data?.errors?.email?.[0] ?? data?.errors?.code?.[0];
      const msg = fieldMsg ?? data?.message ?? "Invalid verification code.";
      throw new ApiError(msg, err.response?.status ?? 500);
    }
    throw err;
  }
}

export async function logout() {
  try {
    await api.post("/v1/auth/logout");
  } catch {
    // Best-effort
  }
}
