import { resolveApiOrigin } from "@/lib/api/resolve-base-url";

function getApiOrigin(): string {
  return resolveApiOrigin();
}

function isRewritableDevHost(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "10.0.2.2") {
    return true;
  }
  if (/^192\.168\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
  return false;
}

/** Resolve relative storage paths from the API into browser-ready URLs. */
export function resolveMediaUrl(url?: string | null): string | null {
  const value = String(url ?? "").trim();
  if (!value) return null;

  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
    try {
      const parsed = new URL(value);
      const storageMatch = parsed.pathname.match(/\/storage\/.+/);
      if (storageMatch) {
        return `${getApiOrigin()}${storageMatch[0]}`;
      }
      if (isRewritableDevHost(parsed.hostname) && parsed.pathname) {
        return `${getApiOrigin()}${parsed.pathname}`;
      }
      return value;
    } catch {
      return value;
    }
  }

  if (value.startsWith("/")) return `${getApiOrigin()}${value}`;
  return `${getApiOrigin()}/${value}`;
}
