function isProductionPaymentsContext(): boolean {
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || /^192\.168\./.test(host)) {
      return false;
    }
    if (/\.gohavena\.com$/i.test(host)) {
      return true;
    }
  }

  const envUrl = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ""
  ).toLowerCase();

  if (/gohavena\.com/.test(envUrl)) {
    return true;
  }

  if (/^https:\/\//.test(envUrl) && !/localhost|127\.0\.0\.1/.test(envUrl)) {
    return true;
  }

  return false;
}

/** Online Pay Now — off on production gohavena hosts until checkout launch. */
export const PAY_NOW_ENABLED = !isProductionPaymentsContext();
