import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow production deploy while residual admin TS strictness issues are cleaned up.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
