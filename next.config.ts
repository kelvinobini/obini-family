import type { NextConfig } from "next";

/**
 * The whole app is private. Nothing here should ever be indexed, framed,
 * or referred out to a third party. Headers are set globally so a new route
 * cannot accidentally opt out of them.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    // Uploads are compressed client-side, but leave room for elders' raw audio.
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), interest-cohort=(), browsing-topics=()",
          },
        ],
      },
      {
        // Media is authorized per-request and must never sit in a shared cache.
        source: "/api/media/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
