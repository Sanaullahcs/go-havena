/** API root used by axios (`…/api`, paths append `/v1/...`). */
export function resolveApiRoot(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/v1\/?$/, "");

  if (typeof window === "undefined") {
    return normalizeApiRoot(envUrl || "http://127.0.0.1:8000/api");
  }

  const { hostname } = window.location;
  // When the portal is opened on localhost, always talk to the local API —
  // even if NEXT_PUBLIC_API_URL points at a Cloudflare tunnel for remote demos.
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return normalizeApiRoot(envUrl?.includes("localhost") || envUrl?.includes("127.0.0.1") ? envUrl : "http://127.0.0.1:8000/api");
  }

  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return normalizeApiRoot(envUrl);
  }

  return `http://${hostname}:8000/api`;
}

/** Full v1 base (`…/api/v1`) for fetch helpers and media URLs. */
export function resolveApiV1Base(): string {
  return `${resolveApiRoot().replace(/\/api\/?$/, "")}/api/v1`;
}

export function resolveApiOrigin(): string {
  return resolveApiRoot().replace(/\/api\/?$/, "");
}

function normalizeApiRoot(url: string): string {
  const trimmed = url.trim().replace(/\/v1\/?$/, "").replace(/\/$/, "");
  if (!trimmed) return "http://127.0.0.1:8000/api";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`.replace(/\/\/api/, "/api");
}
