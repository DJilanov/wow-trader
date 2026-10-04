import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["postgres"],
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
