import axios from "axios";
import { getToken, clearSession } from "@/lib/auth/session";
import { resolveAdminLoginPath } from "@/lib/auth/admin-routes";
import { resolveApiRoot } from "./resolve-base-url";

const api = axios.create({
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  withCredentials: false,
  timeout: 12_000,
});

function needsNgrokBrowserBypass(baseURL: string | undefined): boolean {
  const host = (baseURL ?? "").toLowerCase();
  return host.includes("ngrok-free.app") || host.includes("ngrok.io") || host.includes("ngrok.app");
}

/* Attach LAN-aware API host + token on every request */
api.interceptors.request.use((config) => {
  config.baseURL = resolveApiRoot();
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
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

/** Legacy compat — some pages use ApiError class for instanceof checks */
export class ApiError extends Error {
  status: number;
  code?: string;
  block?: import("@/lib/auth/account-block").AccountBlockDetails;

  constructor(
    message: string,
    status = 500,
    extras?: { code?: string; block?: import("@/lib/auth/account-block").AccountBlockDetails },
  ) {
    super(message);
    this.status = status;
    this.name = "ApiError";
    this.code = extras?.code;
    this.block = extras?.block;
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
      return "Cannot reach the API server. Make sure the backend is running (npm run backend).";
    }
    const data = err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
    const genericValidation = "The given data was invalid.";
    const message = data?.message ?? "";
    const isInternalDbError = /SQLSTATE|Unknown column|SQL:/i.test(message);
    if (data?.errors && !isInternalDbError) {
      const first = Object.values(data.errors)[0];
      if (Array.isArray(first) && first[0]) return first[0] as string;
    }
    if (message && message !== genericValidation && !isInternalDbError) return message;
    if (err.response?.status === 403) {
      return "You do not have permission to view this page.";
    }
    if (err.response?.status === 500 || isInternalDbError) {
      return "Server error — please try again or contact support.";
    }
  }
  return "Something went wrong. Please try again.";
}
