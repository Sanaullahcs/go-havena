import type { NextConfig } from "next";

/**
 * The marketing landing page lives in a separate Next.js project
 * (`landing-page`) from the dashboards/portals (`frontend`). The
 * navbar CTAs ("Login", "Get Started") use absolute URLs to the
 * dashboard origin, configured via the `NEXT_PUBLIC_DASHBOARD_URL`
 * env var (default: `http://localhost:3000`).
 *
 * See `src/lib/site.ts` → `actionLinks` for the actual URLs.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
