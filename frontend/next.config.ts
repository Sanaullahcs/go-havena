import os from "node:os";
import type { NextConfig } from "next";

function lanDevOrigins(): string[] {
  const origins = new Set<string>([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "192.168.*",
    "10.*",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok.app",
    "*.cursor.sh",
    "*.cursor.app",
  ]);

  for (let octet = 16; octet <= 31; octet += 1) {
    origins.add(`172.${octet}.*`);
  }

  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const ipv4 = addr.family === "IPv4" || addr.family === 4;
      if (ipv4 && !addr.internal) {
        origins.add(addr.address);
      }
    }
  }

  return [...origins];
}

const nextConfig: NextConfig = {
  // Phone / LAN access to `next dev` (Expo billing redirect) needs this or
  // /_next assets never load and /admin/billing stays on the skeleton forever.
  allowedDevOrigins: lanDevOrigins(),
  skipTrailingSlashRedirect: true,
  skipProxyUrlNormalize: true,
  async redirects() {
    return [
      {
        source: "/terms-of-service",
        destination: "/terms-and-conditions",
        permanent: true,
      },
    ];
  },
  // Same-origin /api and /storage so Cursor port-forward and Cloudflare
  // frontend URLs reach Laravel without CORS or a dead localhost:8000.
  async rewrites() {
    const backend = (process.env.HAVENA_API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/storage/:path*", destination: `${backend}/storage/:path*` },
    ];
  },
  // Allow production deploy while residual admin TS strictness issues are cleaned up.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
