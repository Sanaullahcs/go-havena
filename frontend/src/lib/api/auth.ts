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
function otpRequestRateLimit(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const record = data as { data?: { rate_limit?: unknown } };
  return record.data?.rate_limit ?? null;
}

export async function requestCommunityAdminOtp(
  email: string,
  mode: "auto" | "login" | "signup" = "auto",
): Promise<{ intent: CommunityAdminOtpIntent; rate_limit: unknown }> {
  if (mode === "signup") {
    try {
      const res = await api.post("/v1/auth/otp/request", {
        email,
        intent: "signup",
        portal: "community_admin_dashboard",
      });
      return { intent: "signup", rate_limit: otpRequestRateLimit(res.data) };
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
    return { intent: "login", rate_limit: otpRequestRateLimit(res.data) };
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
        return { intent: "signup", rate_limit: otpRequestRateLimit(res.data) };
      } catch (signupErr) {
        throwAuthError(signupErr);
      }
    }
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
