import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/tools",
  distDir: process.env.WOW_TRADER_BUILD_DIR || ".next",
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Inline dev debug metadata so an unavailable WebSocket cannot suspend hydration.
  experimental: { reactDebugChannel: false },
  serverExternalPackages: ["postgres"],
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const port = process.env.PORT ?? "3000";
    if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535)
      throw new Error("Invalid local simulator proxy port");
    // Immutable engine bundles retain their root-relative asset URLs. Production has Nginx.
    return [
      {
        source: "/forever-sim/:release([a-f0-9]{24})/:asset*",
        destination: `http://127.0.0.1:${port}/tools/forever-sim/:release/:asset*`,
        basePath: false,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/forever/encyclopedia/leveling",
        destination: "/forever/leveling",
        permanent: true,
      },
      {
        source: "/forever/encyclopedia/leveling/alliance/westfall-13-15",
        destination:
          "/forever/leveling/routes/alliance-human/chapters/chapter-125-13-15-westfall?edition=kfc",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
