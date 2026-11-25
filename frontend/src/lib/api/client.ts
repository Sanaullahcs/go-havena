import axios from "axios";
import { getToken, clearSession, getManagedCommunityId, getUser } from "@/lib/auth/session";
import { resolveAdminLoginPath } from "@/lib/auth/admin-routes";
import { resolveApiRoot } from "./resolve-base-url";

const api = axios.create({
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  withCredentials: false,
  timeout: 12_000,
  transformResponse: [
    ...(Array.isArray(axios.defaults.transformResponse)
      ? axios.defaults.transformResponse
      : axios.defaults.transformResponse
        ? [axios.defaults.transformResponse]
        : []),
    (data: unknown) => stripLeadingPhpNoiseBeforeJson(data),
  ],
});

/** Windows dev `php -S` can prepend notices before JSON; recover the payload when possible. */
function stripLeadingPhpNoiseBeforeJson(data: unknown): unknown {
  if (typeof data !== "string") return data;
  const trimmed = data.trim();
  if (!trimmed.startsWith("<") && !trimmed.startsWith("Notice")) return data;
  const jsonStart = trimmed.search(/[\[{]/);
  if (jsonStart < 0) return data;
  try {
    return JSON.parse(trimmed.slice(jsonStart));
  } catch {
    return data;
  }
}

function needsNgrokBrowserBypass(baseURL: string | undefined): boolean {
  const host = (baseURL ?? "").toLowerCase();
  return host.includes("ngrok-free.app") || host.includes("ngrok.io") || host.includes("ngrok.app");
}

/* Attach LAN-aware API host + token on every request */
api.interceptors.request.use((config) => {
  config.baseURL = resolveApiRoot();
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const existingCommunityHeader = config.headers?.["X-Community-Id"] ?? config.headers?.["x-community-id"];
  if (!existingCommunityHeader) {
    const communityId = getManagedCommunityId(getUser());
    if (communityId) {
      config.headers["X-Community-Id"] = String(communityId);
    }
  }
  if (needsNgrokBrowserBypass(config.baseURL)) {
    config.headers["ngrok-skip-browser-warning"] = "true";
  }
  // Let the browser set multipart boundary. A bare "multipart/form-data"
  // header makes Laravel drop the file and profile save fails.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    const headers = config.headers;
    if (headers && typeof headers.delete === "function") {
      headers.delete("Content-Type");
      headers.delete("content-type");
    } else if (headers) {
      delete (headers as Record<string, unknown>)["Content-Type"];
      delete (headers as Record<string, unknown>)["content-type"];
    }
    config.timeout = Math.max(config.timeout ?? 0, 60_000);
  }
  return config;
});

function preserveMobileReturnQuery(loginPath: string): string {
  if (typeof window === "undefined") return loginPath;
  const current = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  for (const key of ["from", "return_to", "handoff", "plan", "interval"]) {
    const value = current.get(key);
    if (value) keep.set(key, value);
  }
  const query = keep.toString();
  return query ? `${loginPath}?${query}` : loginPath;
}

/* Handle 401 globally */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      const pathname = window.location.pathname;
      const loginPath =
        pathname.startsWith("/home") ||
        pathname.startsWith("/notices") ||
        pathname.startsWith("/feed") ||
        pathname.startsWith("/messages") ||
        pathname.startsWith("/wellness") ||
        pathname.startsWith("/marketplace") ||
        pathname.startsWith("/property") ||
        pathname.startsWith("/profile") ||
        pathname.startsWith("/support")
          ? "/resident-login"
          : resolveAdminLoginPath({ pathname });
      clearSession();
      window.location.href = preserveMobileReturnQuery(loginPath);
    }
    return Promise.reject(err);
  },
);

export default api;

/** Apache on gohavena.com blocks PATCH/DELETE with an HTML 403 before Laravel sees the request. */
export function isProxyMethodBlocked(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  if (status === 405) return true;
  if (status !== 403) return false;
  const data = err.response?.data;
  return typeof data === "string" || data == null;
}


/** Legacy compat — some pages use ApiError class for instanceof checks */
export class ApiError extends Error {
  status: number;
  code?: string;
  block?: import("@/lib/auth/account-block").AccountBlockDetails;
  retryAfterSeconds?: number;
  rateLimit?: unknown;

  constructor(
    message: string,
    status = 500,
    extras?: {
      code?: string;
      block?: import("@/lib/auth/account-block").AccountBlockDetails;
      retryAfterSeconds?: number;
      rateLimit?: unknown;
    },
  ) {
    super(message);
    this.status = status;
    this.name = "ApiError";
    this.code = extras?.code;
    this.block = extras?.block;
    this.retryAfterSeconds = extras?.retryAfterSeconds;
    this.rateLimit = extras?.rateLimit;
  }
}

/** Map Laravel / API validation errors to field keys. */
export function apiFieldErrors(err: unknown): Record<string, string> {
  if (!axios.isAxiosError(err)) return {};

  const data = err.response?.data as {
    errors?: Record<string, string[]>;
    code?: string;
    message?: string;
  } | undefined;

  const out: Record<string, string> = {};

  if (data?.errors) {
    for (const [key, msgs] of Object.entries(data.errors)) {
      if (Array.isArray(msgs) && msgs[0]) out[key] = msgs[0];
    }
  }

  if (data?.code === "COUPON_CODE_TAKEN" && data.message) {
    out.code = data.message;
  }

  return out;
}

/** Extract error message from axios error */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") {
      return "Request timed out. The server may be slow or unavailable — try again.";
    }
    if (!err.response) {
      const host = (err.config?.baseURL ?? "").toLowerCase();
      if (host.includes("gohavena.com")) {
        return "Cannot reach Havena right now. Check your connection and try again.";
      }
      return "Cannot reach the API server. Make sure the backend is running (npm run backend).";
    }
    const status = err.response.status;
    const data = err.response?.data as
      | { message?: string; errors?: Record<string, string[]> }
      | string
      | undefined;
    const hasApiMessage =
      typeof data === "object" && data !== null && typeof data.message === "string" && data.message.trim() !== "";
    if ((status === 500 || status === 502 || status === 503 || status === 504) && !hasApiMessage) {
      return "The API server is not running. From the project root run: npm run backend (or npm run dev).";
    }
    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed.startsWith("<") || trimmed.includes("Internal Server Error")) {
        return "The API server is not running. From the project root run: npm run backend (or npm run dev).";
      }
    }
    const payload = typeof data === "object" && data !== null ? data : undefined;
    const genericValidation = "The given data was invalid.";
    const message = payload?.message ?? "";
    const isInternalDbError = /SQLSTATE|Unknown column|\bSQL:/i.test(message);
    const isPhpInternal =
      /Class ["'][^"']+["'] not found|ErrorException|Stack trace|syntax error,|Undefined (property|variable|constant|method)|Call to undefined|Allowed memory size/i.test(
        message,
      );
    const isInternal = isInternalDbError || isPhpInternal;
    if (payload?.errors && !isInternal) {
      const first = Object.values(payload.errors)[0];
      if (Array.isArray(first) && first[0]) return first[0] as string;
    }
    if (message && message !== genericValidation && !isInternal) return message;
    if (err.response?.status === 413) {
      return "This image is too large for the server. Use a JPG or PNG under 5 MB.";
    }
    if (err.response?.status === 403) {
      if (typeof err.response.data === "string") {
        return "This action was blocked by the server. Refresh and try again.";
      }
      return "You do not have permission to do that.";
    }
    if (err.response?.status === 500 || isInternal) {
      const url = String(err.config?.url ?? "");
      const payload = err.response?.data;
      const proxyOnlyFailure =
        !isInternal &&
        (payload == null ||
          (typeof payload === "string" &&
            /internal server error|failed to proxy|ECONNREFUSED/i.test(payload)));
      if (proxyOnlyFailure) {
        return "Cannot reach the API server. Start it with npm run backend (or npm run dev).";
      }
      if (url.includes("notices") || url.includes("upload-image")) {
        return "Could not save this notice. Please try again, or use a smaller image.";
      }
      if (url.includes("/me")) {
        return "We couldn't save your profile. Please try again.";
      }
      return "Server error — please try again or contact support.";
    }
  }
  return "Something went wrong. Please try again.";
}
