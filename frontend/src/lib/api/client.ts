import axios from "axios";
import { getToken, clearSession } from "@/lib/auth/session";
import { resolveAdminLoginPath } from "@/lib/auth/admin-routes";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/v1\/?$/, "") ||
  "http://127.0.0.1:8000/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  withCredentials: false,
  timeout: 12_000,
});

/* Attach token on every request */
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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
        pathname.startsWith("/support") ||
        pathname.startsWith("/join")
          ? "/login?audience=resident"
          : resolveAdminLoginPath({ pathname });
      clearSession();
      window.location.href = loginPath;
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
    if (data?.errors) {
      const first = Object.values(data.errors)[0];
      if (Array.isArray(first) && first[0]) return first[0] as string;
    }
    if (data?.message && data.message !== genericValidation) return data.message;
    if (err.response?.status === 403) {
      return "You do not have permission to view this page.";
    }
    if (err.response?.status === 500) {
      return "Server error — please try again or contact support.";
    }
  }
  return "Something went wrong. Please try again.";
}
